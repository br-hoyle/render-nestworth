import uuid
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_current_session, get_tenant_db
from app.schemas.balances import (
    AccountSeries,
    BalanceRead,
    BalanceUpsert,
    NetWorthPoint,
    SeriesPoint,
)
from app.services.forward_fill import Snapshot, forward_fill_series

router = APIRouter(tags=["balances"])

OPEN_ENDED = date(9999, 12, 31)


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


@router.get("/networth/series")
def networth_series(
    start: date,
    end: date | None = Query(default=None),
    granularity: str = Query(default="monthly", pattern="^(daily|monthly)$"),
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> dict:
    today = end or date.today()
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
