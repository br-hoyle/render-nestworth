import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_current_session, get_tenant_db
from app.schemas.income import (
    IncomeConflict,
    IncomeCreate,
    IncomeEndRequest,
    IncomeRead,
    IncomeSummary,
)
from app.services.effective_dates import (
    DateRange,
    OPEN_ENDED_SENTINEL,
    find_conflict,
    resolve_by_ending_previous_the_day_before,
    validate_no_overlap,
)

router = APIRouter(prefix="/income", tags=["income"])


@router.get("", response_model=list[IncomeRead])
def list_income(
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> list[IncomeRead]:
    rows = conn.execute(
        text(
            "select income_id, individual, company, income, effective_start_date, effective_end_date "
            "from income where household_id = :household_id "
            "order by individual, effective_start_date desc"
        ),
        {"household_id": session.household_id},
    ).mappings().all()
    return [
        IncomeRead(**row, is_open=row["effective_end_date"] == OPEN_ENDED_SENTINEL) for row in rows
    ]


@router.post("", response_model=IncomeRead, status_code=status.HTTP_201_CREATED)
def create_income(
    payload: IncomeCreate,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> IncomeRead:
    rows = conn.execute(
        text(
            "select income_id, effective_start_date, effective_end_date from income "
            "where household_id = :household_id and individual = :individual and company = :company"
        ),
        {"household_id": session.household_id, "individual": payload.individual, "company": payload.company},
    ).mappings().all()
    existing = [DateRange(r["effective_start_date"], r["effective_end_date"]) for r in rows]
    new_range = DateRange(payload.effective_start_date, payload.effective_end_date)

    conflict = find_conflict(existing, new_range)
    if conflict is not None:
        conflicting_row = next(
            r for r in rows if r["effective_start_date"] == conflict.start and r["effective_end_date"] == conflict.end
        )
        suggested = None
        try:
            suggested = resolve_by_ending_previous_the_day_before(conflict, payload.effective_start_date)
        except ValueError:
            pass
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=IncomeConflict(
                income_id=conflicting_row["income_id"],
                individual=payload.individual,
                company=payload.company,
                effective_start_date=conflict.start,
                effective_end_date=conflict.end,
                suggested_resolution_end_date=suggested,
            ).model_dump(mode="json"),
        )

    income_id = uuid.uuid4()
    conn.execute(
        text(
            """
            insert into income
                (income_id, household_id, individual, company, income,
                 effective_start_date, effective_end_date)
            values
                (:income_id, :household_id, :individual, :company, :income, :start, :end)
            """
        ),
        {
            "income_id": income_id,
            "household_id": session.household_id,
            "individual": payload.individual,
            "company": payload.company,
            "income": payload.income,
            "start": payload.effective_start_date,
            "end": payload.effective_end_date,
        },
    )
    return IncomeRead(
        income_id=income_id,
        individual=payload.individual,
        company=payload.company,
        income=payload.income,
        effective_start_date=payload.effective_start_date,
        effective_end_date=payload.effective_end_date,
        is_open=payload.effective_end_date == OPEN_ENDED_SENTINEL,
    )


@router.post("/{income_id}/end", status_code=status.HTTP_204_NO_CONTENT)
def end_income(
    income_id: uuid.UUID,
    payload: IncomeEndRequest,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> None:
    current = conn.execute(
        text(
            "select effective_start_date from income "
            "where income_id = :income_id and household_id = :household_id"
        ),
        {"income_id": income_id, "household_id": session.household_id},
    ).mappings().first()
    if current is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if payload.effective_end_date < current["effective_start_date"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="End date must be on or after the start date.")

    conn.execute(
        text("update income set effective_end_date = :end where income_id = :income_id"),
        {"end": payload.effective_end_date, "income_id": income_id},
    )


@router.get("/summary", response_model=IncomeSummary)
def income_summary(
    as_of: date | None = None,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> IncomeSummary:
    today = as_of or date.today()
    rows = conn.execute(
        text(
            "select individual, income from income "
            "where household_id = :household_id and effective_start_date <= :today and effective_end_date >= :today"
        ),
        {"household_id": session.household_id, "today": today},
    ).mappings().all()

    by_individual: dict[str, Decimal] = {}
    for row in rows:
        by_individual[row["individual"]] = by_individual.get(row["individual"], Decimal(0)) + row["income"]

    return IncomeSummary(
        as_of=today,
        total_annual_income=sum(by_individual.values(), Decimal(0)),
        by_individual=by_individual,
    )
