import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_current_session, get_tenant_db
from app.schemas.accounts import (
    OPEN_ENDED,
    AccountClose,
    AccountCreate,
    AccountRead,
    AccountRevise,
    AccountSparkline,
    BalanceGridCategory,
    BalanceGridResponse,
    BalanceGridRow,
    BalanceHistoryAccount,
    BalanceHistoryInstitution,
    BalanceHistoryResponse,
    SparklinePoint,
    StaleAccountInfo,
)
from app.services.effective_dates import (
    DateRange,
    OverlapError,
    validate_no_overlap,
)
from app.services.forward_fill import Snapshot, forward_fill_series, is_stale, staleness_days

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _existing_ranges(
    conn: Connection,
    household_id: str,
    account_name: str,
    exclude_account_id: uuid.UUID | None = None,
) -> list[DateRange]:
    query = (
        "select effective_start_date, effective_end_date from accounts "
        "where household_id = :household_id and account_name = :account_name"
    )
    params: dict = {"household_id": household_id, "account_name": account_name}
    if exclude_account_id is not None:
        query += " and account_id != :exclude_account_id"
        params["exclude_account_id"] = exclude_account_id
    rows = conn.execute(text(query), params).all()
    return [DateRange(r.effective_start_date, r.effective_end_date) for r in rows]


@router.get("", response_model=list[AccountRead])
def list_accounts(
    filter: Literal["active", "closed", "all"] = "active",
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> list[AccountRead]:
    where = "where a.household_id = :household_id"
    if filter == "active":
        where += " and a.effective_end_date = '9999-12-31'"
    elif filter == "closed":
        where += " and a.effective_end_date < '9999-12-31'"

    rows = conn.execute(
        text(
            f"""
            select a.account_id, a.balance_type, a.institution_name, a.category,
                   a.account_type, a.account_name, a.effective_start_date, a.effective_end_date,
                   (select b.balance from balances b
                    where b.account_id = a.account_id
                    order by b.full_date desc limit 1) as latest_balance
            from accounts a
            {where}
            order by a.category, a.account_name, a.effective_start_date desc
            """
        ),
        {"household_id": session.household_id},
    ).mappings().all()

    return [
        AccountRead(
            **row,
            is_open=row["effective_end_date"] == OPEN_ENDED,
        )
        for row in rows
    ]


@router.get("/stale", response_model=list[StaleAccountInfo])
def stale_accounts(
    as_of: date | None = None,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> list[StaleAccountInfo]:
    today = as_of or date.today()

    settings_row = conn.execute(
        text("select settings from household_settings where household_id = :household_id"),
        {"household_id": session.household_id},
    ).mappings().first()
    threshold = 30
    if settings_row and settings_row["settings"]:
        threshold = settings_row["settings"].get("stale_threshold_days", 30)

    rows = conn.execute(
        text(
            """
            select a.account_id, a.account_name,
                   (select max(b.full_date) from balances b where b.account_id = a.account_id) as last_real_date
            from accounts a
            where a.household_id = :household_id and a.effective_end_date = '9999-12-31'
            """
        ),
        {"household_id": session.household_id},
    ).mappings().all()

    result = []
    for row in rows:
        days = staleness_days(row["last_real_date"], today)
        result.append(
            StaleAccountInfo(
                account_id=row["account_id"],
                account_name=row["account_name"],
                last_real_date=row["last_real_date"],
                days_stale=days,
                is_stale=is_stale(row["last_real_date"], today, threshold),
            )
        )
    return result


@router.get("/sparklines", response_model=list[AccountSparkline])
def account_sparklines(
    limit: int = 12,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> list[AccountSparkline]:
    """Last N real snapshots per active account, in one batch query (avoids N+1 round
    trips) — feeds the small inline sparkline next to each account's balance."""
    rows = conn.execute(
        text(
            """
            select account_id, full_date, balance from (
                select b.account_id, b.full_date, b.balance,
                       row_number() over (partition by b.account_id order by b.full_date desc) as rn
                from balances b
                join accounts a on a.account_id = b.account_id
                where a.household_id = :household_id and a.effective_end_date = '9999-12-31'
            ) ranked
            where rn <= :limit
            order by account_id, full_date
            """
        ),
        {"household_id": session.household_id, "limit": limit},
    ).mappings().all()

    by_account: dict[uuid.UUID, list[SparklinePoint]] = {}
    for row in rows:
        by_account.setdefault(row["account_id"], []).append(
            SparklinePoint(full_date=row["full_date"], balance=row["balance"])
        )
    return [AccountSparkline(account_id=account_id, points=points) for account_id, points in by_account.items()]


@router.get("/balance-grid", response_model=BalanceGridResponse)
def account_balance_grid(
    limit: int = 8,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> BalanceGridResponse:
    """Unlike /sparklines (last N snapshots per account, independently dated), this puts
    every open account on the SAME shared axis — the household's last N distinct snapshot
    dates — so institutions can sit side by side in one table and categories can be totaled
    per date. Category totals net asset and liability accounts together (e.g. a mortgage
    offsets the home it's secured by), matching Overview's Balances-by-Category behavior."""
    date_rows = conn.execute(
        text(
            """
            select distinct b.full_date
            from balances b
            join accounts a on a.account_id = b.account_id
            where a.household_id = :household_id and a.effective_end_date = '9999-12-31'
            order by b.full_date desc
            limit :limit
            """
        ),
        {"household_id": session.household_id, "limit": limit},
    ).all()
    dates = sorted(r.full_date for r in date_rows)
    if not dates:
        return BalanceGridResponse(dates=[], categories=[], grand_totals=[])

    accounts = conn.execute(
        text(
            """
            select account_id, account_name, institution_name, category, account_type, balance_type
            from accounts
            where household_id = :household_id and effective_end_date = '9999-12-31'
            order by category, institution_name, account_name
            """
        ),
        {"household_id": session.household_id},
    ).mappings().all()

    category_order: list[str] = []
    rows_by_category: dict[str, list[BalanceGridRow]] = {}
    totals_by_category: dict[str, list[Decimal]] = {}
    grand_totals = [Decimal(0) for _ in dates]

    for acct in accounts:
        snapshot_rows = conn.execute(
            text(
                "select full_date, balance from balances "
                "where account_id = :account_id and full_date <= :end order by full_date"
            ),
            {"account_id": acct["account_id"], "end": dates[-1]},
        ).all()
        snapshots = [Snapshot(r.full_date, r.balance) for r in snapshot_rows]
        points = forward_fill_series(snapshots, dates)
        by_date = {p.full_date: p.balance for p in points}
        values = [by_date.get(d) for d in dates]

        category = acct["category"]
        if category not in rows_by_category:
            category_order.append(category)
            rows_by_category[category] = []
            totals_by_category[category] = [Decimal(0) for _ in dates]

        rows_by_category[category].append(
            BalanceGridRow(
                account_id=acct["account_id"],
                account_name=acct["account_name"],
                institution_name=acct["institution_name"],
                account_type=acct["account_type"],
                balance_type=acct["balance_type"],
                values=values,
            )
        )

        sign = Decimal(-1) if acct["balance_type"] == "liability" else Decimal(1)
        for i, v in enumerate(values):
            if v is None:
                continue
            totals_by_category[category][i] += sign * v
            grand_totals[i] += sign * v

    categories = [
        BalanceGridCategory(category=cat, rows=rows_by_category[cat], totals=totals_by_category[cat])
        for cat in category_order
    ]
    return BalanceGridResponse(dates=dates, categories=categories, grand_totals=grand_totals)


@router.get("/balance-history", response_model=BalanceHistoryResponse)
def account_balance_history(
    limit: int = 25,
    offset: int = 0,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> BalanceHistoryResponse:
    """Paginated, all-account balance history for the Accounts page's spreadsheet tab: one
    column per account grouped by institution, plus a net-worth total column. Dates are
    always most-recent-first — `offset`/`limit` page backward through progressively OLDER
    dates, so page 1 (offset=0) always starts at today's most recent snapshot. Closed
    accounts are included since their history still belongs in a full-history view — only
    /balance-grid (the "current" view) restricts to open accounts."""
    accounts = conn.execute(
        text(
            """
            select account_id, account_name, institution_name, balance_type, effective_end_date
            from accounts
            where household_id = :household_id
            order by institution_name, account_name
            """
        ),
        {"household_id": session.household_id},
    ).mappings().all()
    if not accounts:
        return BalanceHistoryResponse(dates=[], net_worth=[], institutions=[])

    date_rows = conn.execute(
        text(
            """
            select distinct b.full_date
            from balances b
            join accounts a on a.account_id = b.account_id
            where a.household_id = :household_id
            order by b.full_date desc
            """
        ),
        {"household_id": session.household_id},
    ).all()
    total_dates = len(date_rows)
    # Slice the descending (most-recent-first) list for this page, then re-sort ascending —
    # forward_fill_series requires ascending query dates — before reversing back for display.
    page_dates_desc = [r.full_date for r in date_rows][offset : offset + limit]
    dates_asc = sorted(page_dates_desc)
    if not dates_asc:
        return BalanceHistoryResponse(dates=[], net_worth=[], institutions=[], total_dates=total_dates)

    net_worth_asc = [Decimal(0) for _ in dates_asc]
    institution_order: list[str] = []
    accounts_by_institution: dict[str, list[BalanceHistoryAccount]] = {}

    for acct in accounts:
        snapshot_rows = conn.execute(
            text("select full_date, balance from balances where account_id = :account_id order by full_date"),
            {"account_id": acct["account_id"]},
        ).all()
        snapshots = [Snapshot(r.full_date, r.balance) for r in snapshot_rows]
        account_end = None if acct["effective_end_date"] == OPEN_ENDED else acct["effective_end_date"]
        points = forward_fill_series(snapshots, dates_asc, account_effective_end=account_end)
        by_date = {p.full_date: p.balance for p in points}
        values_asc = [by_date.get(d) for d in dates_asc]

        sign = Decimal(-1) if acct["balance_type"] == "liability" else Decimal(1)
        for i, v in enumerate(values_asc):
            if v is not None:
                net_worth_asc[i] += sign * v

        institution = acct["institution_name"]
        if institution not in accounts_by_institution:
            institution_order.append(institution)
            accounts_by_institution[institution] = []
        accounts_by_institution[institution].append(
            BalanceHistoryAccount(
                account_id=acct["account_id"],
                account_name=acct["account_name"],
                balance_type=acct["balance_type"],
                values=list(reversed(values_asc)),
            )
        )

    institutions = [
        BalanceHistoryInstitution(institution_name=inst, accounts=accounts_by_institution[inst])
        for inst in institution_order
    ]
    return BalanceHistoryResponse(
        dates=list(reversed(dates_asc)),
        net_worth=list(reversed(net_worth_asc)),
        institutions=institutions,
        total_dates=total_dates,
    )


@router.post("", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: AccountCreate,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> AccountRead:
    existing = _existing_ranges(conn, session.household_id, payload.account_name)
    try:
        validate_no_overlap(existing, DateRange(payload.effective_start_date, OPEN_ENDED))
    except OverlapError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(e))

    account_id = uuid.uuid4()
    conn.execute(
        text(
            """
            insert into accounts
                (account_id, household_id, balance_type, institution_name, category,
                 account_type, account_name, effective_start_date, effective_end_date)
            values
                (:account_id, :household_id, :balance_type, :institution_name, :category,
                 :account_type, :account_name, :start, '9999-12-31')
            """
        ),
        {
            "account_id": account_id,
            "household_id": session.household_id,
            "balance_type": payload.balance_type,
            "institution_name": payload.institution_name,
            "category": payload.category,
            "account_type": payload.account_type,
            "account_name": payload.account_name,
            "start": payload.effective_start_date,
        },
    )
    return AccountRead(
        account_id=account_id,
        balance_type=payload.balance_type,
        institution_name=payload.institution_name,
        category=payload.category,
        account_type=payload.account_type,
        account_name=payload.account_name,
        effective_start_date=payload.effective_start_date,
        effective_end_date=OPEN_ENDED,
        is_open=True,
        latest_balance=None,
    )


@router.patch("/{account_id}", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def revise_account(
    account_id: uuid.UUID,
    payload: AccountRevise,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> AccountRead:
    current = conn.execute(
        text(
            "select account_id, effective_start_date, effective_end_date from accounts "
            "where account_id = :account_id and household_id = :household_id"
        ),
        {"account_id": account_id, "household_id": session.household_id},
    ).mappings().first()

    if current is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if current["effective_end_date"] != OPEN_ENDED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Only the currently open revision can be edited.")
    if payload.new_revision_start_date <= current["effective_start_date"]:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="The new revision must start after the current revision's start date.",
        )

    prior_end = payload.new_revision_start_date - timedelta(days=1)

    existing = _existing_ranges(
        conn, session.household_id, payload.account_name, exclude_account_id=account_id
    )
    try:
        validate_no_overlap(existing, DateRange(payload.new_revision_start_date, OPEN_ENDED))
    except OverlapError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(e))

    new_account_id = uuid.uuid4()
    conn.execute(
        text("update accounts set effective_end_date = :end where account_id = :account_id"),
        {"end": prior_end, "account_id": account_id},
    )
    conn.execute(
        text(
            """
            insert into accounts
                (account_id, household_id, balance_type, institution_name, category,
                 account_type, account_name, effective_start_date, effective_end_date)
            values
                (:account_id, :household_id, :balance_type, :institution_name, :category,
                 :account_type, :account_name, :start, '9999-12-31')
            """
        ),
        {
            "account_id": new_account_id,
            "household_id": session.household_id,
            "balance_type": payload.balance_type,
            "institution_name": payload.institution_name,
            "category": payload.category,
            "account_type": payload.account_type,
            "account_name": payload.account_name,
            "start": payload.new_revision_start_date,
        },
    )

    return AccountRead(
        account_id=new_account_id,
        balance_type=payload.balance_type,
        institution_name=payload.institution_name,
        category=payload.category,
        account_type=payload.account_type,
        account_name=payload.account_name,
        effective_start_date=payload.new_revision_start_date,
        effective_end_date=OPEN_ENDED,
        is_open=True,
        latest_balance=None,
    )


@router.post("/{account_id}/close", status_code=status.HTTP_204_NO_CONTENT)
def close_account(
    account_id: uuid.UUID,
    payload: AccountClose,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> None:
    current = conn.execute(
        text(
            "select effective_start_date, effective_end_date from accounts "
            "where account_id = :account_id and household_id = :household_id"
        ),
        {"account_id": account_id, "household_id": session.household_id},
    ).mappings().first()
    if current is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if payload.effective_end_date < current["effective_start_date"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="End date must be on or after the start date.")

    conn.execute(
        text("update accounts set effective_end_date = :end where account_id = :account_id"),
        {"end": payload.effective_end_date, "account_id": account_id},
    )
