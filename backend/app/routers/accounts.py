import uuid
from datetime import date, timedelta
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
    StaleAccountInfo,
)
from app.services.effective_dates import (
    DateRange,
    OverlapError,
    validate_no_overlap,
)
from app.services.forward_fill import is_stale, staleness_days

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
