import csv
import io
import json
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_current_session, get_tenant_db
from app.schemas.balances import (
    AccountSeries,
    BalanceImportResult,
    BalanceImportRowError,
    BalanceRead,
    BalanceUpsert,
    BulkBalanceImportResult,
    NetWorthPoint,
    SeriesPoint,
)
from app.services.forward_fill import Snapshot, forward_fill_series

router = APIRouter(tags=["balances"])

OPEN_ENDED = date(9999, 12, 31)

_DATE_FORMATS = ["%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"]


def _parse_date(raw: str) -> date | None:
    raw = raw.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


@router.post("/balances/import", response_model=BalanceImportResult)
async def import_balance_history(
    account_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> BalanceImportResult:
    """Simpler than the transaction CSV pipeline on purpose: a 2-column (date, balance)
    file for ONE already-existing account. No dedup fingerprint needed — the
    (account_id, full_date) unique constraint plus on-conflict-update already makes a
    re-upload idempotent, so this upserts directly rather than doing a separate preview step."""
    owner_check = conn.execute(
        text("select 1 from accounts where account_id = :account_id and household_id = :household_id"),
        {"account_id": account_id, "household_id": session.household_id},
    ).first()
    if owner_check is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Account not found.")

    raw = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))

    errors: list[BalanceImportRowError] = []
    inserted = 0
    for i, row in enumerate(reader, start=1):
        normalized = {k.strip().lower(): (v or "") for k, v in row.items()}
        date_raw = normalized.get("date", "")
        balance_raw = normalized.get("balance", "")

        parsed_date = _parse_date(date_raw)
        if parsed_date is None:
            errors.append(BalanceImportRowError(row_number=i, raw=row, reason="unparseable date"))
            continue
        try:
            parsed_balance = Decimal(balance_raw.strip().replace("$", "").replace(",", ""))
        except (InvalidOperation, AttributeError):
            errors.append(BalanceImportRowError(row_number=i, raw=row, reason="unparseable balance"))
            continue

        conn.execute(
            text(
                """
                insert into balances (balance_id, household_id, account_id, full_date, balance)
                values (:balance_id, :household_id, :account_id, :full_date, :balance)
                on conflict (account_id, full_date) do update set balance = excluded.balance
                """
            ),
            {
                "balance_id": uuid.uuid4(),
                "household_id": session.household_id,
                "account_id": account_id,
                "full_date": parsed_date,
                "balance": parsed_balance,
            },
        )
        inserted += 1

    return BalanceImportResult(inserted_count=inserted, errors=errors)


_ACCOUNT_COLUMN_ALIASES = {"account", "account name", "account_name"}


@router.post("/balances/bulk-import", response_model=BulkBalanceImportResult)
async def bulk_import_balance_history(
    file: UploadFile = File(...),
    account_mapping: str | None = Form(default=None),
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> BulkBalanceImportResult:
    """Bulk balance CSV across many accounts at once (columns: account, date, balance).
    Two-step like the transaction importer: without `account_mapping`, returns the distinct
    raw account labels found so the caller can map each to a real `account_id`; re-posting
    the same file with `account_mapping` (JSON: {label: account_id | null}, null = skip)
    commits the upsert."""
    raw = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    rows = list(reader)

    if not rows:
        return BulkBalanceImportResult(needs_mapping=False, inserted_count=0, skipped_count=0, errors=[])

    account_column = next(
        (h for h in rows[0].keys() if h and h.strip().lower() in _ACCOUNT_COLUMN_ALIASES), None
    )
    if account_column is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="CSV needs an 'account' column.")

    distinct_labels = sorted({(row.get(account_column) or "").strip() for row in rows if (row.get(account_column) or "").strip()})

    mapping: dict[str, str | None] = json.loads(account_mapping) if account_mapping else {}
    if not account_mapping or any(label not in mapping for label in distinct_labels):
        return BulkBalanceImportResult(needs_mapping=True, distinct_accounts=distinct_labels)

    mapped_account_ids = {v for v in mapping.values() if v}
    if mapped_account_ids:
        owned = conn.execute(
            text("select account_id from accounts where household_id = :household_id and account_id = any(:ids)"),
            {"household_id": session.household_id, "ids": list(mapped_account_ids)},
        ).all()
        if len(owned) != len(mapped_account_ids):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="One or more mapped accounts were not found.")

    errors: list[BalanceImportRowError] = []
    inserted = 0
    skipped = 0
    for i, row in enumerate(rows, start=1):
        normalized = {k.strip().lower(): (v or "") for k, v in row.items()}
        label = (row.get(account_column) or "").strip()
        account_id = mapping.get(label)
        if not account_id:
            skipped += 1
            continue

        date_raw = normalized.get("date", "")
        balance_raw = normalized.get("balance", "")
        parsed_date = _parse_date(date_raw)
        if parsed_date is None:
            errors.append(BalanceImportRowError(row_number=i, raw=row, reason="unparseable date"))
            continue
        try:
            parsed_balance = Decimal(balance_raw.strip().replace("$", "").replace(",", ""))
        except (InvalidOperation, AttributeError):
            errors.append(BalanceImportRowError(row_number=i, raw=row, reason="unparseable balance"))
            continue

        conn.execute(
            text(
                """
                insert into balances (balance_id, household_id, account_id, full_date, balance)
                values (:balance_id, :household_id, :account_id, :full_date, :balance)
                on conflict (account_id, full_date) do update set balance = excluded.balance
                """
            ),
            {
                "balance_id": uuid.uuid4(),
                "household_id": session.household_id,
                "account_id": account_id,
                "full_date": parsed_date,
                "balance": parsed_balance,
            },
        )
        inserted += 1

    return BulkBalanceImportResult(needs_mapping=False, inserted_count=inserted, skipped_count=skipped, errors=errors)


@router.post("/balances", response_model=BalanceRead, status_code=201)
def upsert_balance(
    payload: BalanceUpsert,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> BalanceRead:
    balance_id = uuid.uuid4()
    row = conn.execute(
        text(
            """
            insert into balances (balance_id, household_id, account_id, full_date, balance)
            values (:balance_id, :household_id, :account_id, :full_date, :balance)
            on conflict (account_id, full_date)
            do update set balance = excluded.balance
            returning balance_id, account_id, full_date, balance
            """
        ),
        {
            "balance_id": balance_id,
            "household_id": session.household_id,
            "account_id": payload.account_id,
            "full_date": payload.full_date,
            "balance": payload.balance,
        },
    ).mappings().first()
    return BalanceRead(**row)


@router.get("/balances", response_model=list[BalanceRead])
def list_balances(
    account_id: uuid.UUID,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> list[BalanceRead]:
    rows = conn.execute(
        text(
            "select balance_id, account_id, full_date, balance from balances "
            "where household_id = :household_id and account_id = :account_id "
            "order by full_date"
        ),
        {"household_id": session.household_id, "account_id": account_id},
    ).mappings().all()
    return [BalanceRead(**row) for row in rows]


@router.delete("/balances/{balance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_balance(
    balance_id: uuid.UUID,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> None:
    conn.execute(
        text("delete from balances where balance_id = :id and household_id = :household_id"),
        {"id": balance_id, "household_id": session.household_id},
    )


@router.get("/balances/export.csv")
def export_balances_csv(
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> Response:
    """Every balance snapshot the household has recorded, joined to whichever version of the
    account (a Type-2 SCD) was actually in effect on that snapshot's date — so a renamed or
    reclassified account still exports historically-accurate labels rather than just its
    current ones."""
    rows = conn.execute(
        text(
            """
            select b.balance_id, a.balance_type, a.institution_name, a.category,
                   a.account_type, a.account_name, b.full_date, b.balance
            from balances b
            join accounts a
                on a.account_id = b.account_id
                and b.full_date >= a.effective_start_date
                and b.full_date < a.effective_end_date
            where b.household_id = :household_id
            order by a.account_name, b.full_date
            """
        ),
        {"household_id": session.household_id},
    ).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["balance_id", "balance_type", "institution_name", "category", "account_type", "account_name", "full_date", "balance"]
    )
    for row in rows:
        writer.writerow(row)

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=nestworth-balances.csv"},
    )


def _query_dates(start: date, end: date, granularity: str) -> list[date]:
    if granularity == "monthly":
        dates = []
        d = date(start.year, start.month, 1)
        while d <= end:
            last_day = (date(d.year, 12, 31) if d.month == 12 else date(d.year, d.month + 1, 1) - timedelta(days=1))
            if start <= last_day <= end:
                dates.append(last_day)
            elif last_day > end:
                dates.append(end)
            d = date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)
        return sorted(set(dates))
    # daily
    days = (end - start).days
    return [start + timedelta(days=i) for i in range(max(days, 0) + 1)]


def _latest_real_balance_date(conn: Connection, household_id: str) -> date | None:
    """The most recent date the household actually entered a balance for any account — used to
    cap the net worth series so it never extends past real data. Without this, the series (and
    the chart's rightmost point, and the "BoB" day-over-day delta) would forward-fill every
    account's last known balance all the way to today even when nothing was updated today —
    fabricating a "today" data point out of stale numbers rather than reflecting an actual gap in
    updates."""
    row = conn.execute(
        text("select max(full_date) as latest from balances where household_id = :household_id"),
        {"household_id": household_id},
    ).first()
    return row.latest if row and row.latest else None


@router.get("/networth/series")
def networth_series(
    start: date,
    end: date | None = Query(default=None),
    granularity: str = Query(default="monthly", pattern="^(daily|monthly)$"),
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> dict:
    if end is not None:
        today = end
    else:
        latest_real_date = _latest_real_balance_date(conn, session.household_id)
        today = min(date.today(), latest_real_date) if latest_real_date else date.today()
    query_dates = _query_dates(start, today, granularity)

    accounts = conn.execute(
        text(
            "select account_id, account_name, balance_type, effective_start_date, effective_end_date "
            "from accounts where household_id = :household_id and effective_start_date <= :end"
        ),
        {"household_id": session.household_id, "end": today},
    ).mappings().all()

    account_series: list[AccountSeries] = []
    net_by_date: dict[date, dict[str, Decimal]] = {
        d: {"assets": Decimal(0), "liabilities": Decimal(0)} for d in query_dates
    }

    for acct in accounts:
        snapshot_rows = conn.execute(
            text(
                "select full_date, balance from balances "
                "where account_id = :account_id and full_date <= :end order by full_date"
            ),
            {"account_id": acct["account_id"], "end": today},
        ).all()
        snapshots = [Snapshot(r.full_date, r.balance) for r in snapshot_rows]

        effective_end = None if acct["effective_end_date"] == OPEN_ENDED else acct["effective_end_date"]
        relevant_dates = [d for d in query_dates if d >= acct["effective_start_date"]]
        points = forward_fill_series(snapshots, relevant_dates, account_effective_end=effective_end)

        account_series.append(
            AccountSeries(
                account_id=acct["account_id"],
                account_name=acct["account_name"],
                balance_type=acct["balance_type"],
                points=[SeriesPoint(full_date=p.full_date, balance=p.balance, is_real=p.is_real) for p in points],
            )
        )

        for p in points:
            bucket = "assets" if acct["balance_type"] == "asset" else "liabilities"
            net_by_date[p.full_date][bucket] += p.balance

    net_worth_points = [
        NetWorthPoint(
            full_date=d,
            assets=net_by_date[d]["assets"],
            liabilities=net_by_date[d]["liabilities"],
            net_worth=net_by_date[d]["assets"] - net_by_date[d]["liabilities"],
        )
        for d in query_dates
    ]

    return {
        "net_worth": [p.model_dump(mode="json") for p in net_worth_points],
        "accounts": [a.model_dump(mode="json") for a in account_series],
    }
