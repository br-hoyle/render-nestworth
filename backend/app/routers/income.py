import uuid
from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_current_session, get_tenant_db
from app.schemas.income import (
    IncomeConflict,
    IncomeCreate,
    IncomeEndRequest,
    IncomeRead,
    IncomeSeriesPoint,
    IncomeSeriesResponse,
    IncomeSummary,
    IncomeUpdate,
)
from app.services.effective_dates import (
    DateRange,
    OPEN_ENDED_SENTINEL,
    OverlapError,
    find_conflict,
    resolve_by_ending_previous_the_day_before,
    validate_no_overlap,
)

router = APIRouter(prefix="/income", tags=["income"])


def _existing_ranges(
    conn: Connection,
    household_id: str,
    individual: str,
    company: str,
    exclude_income_id: uuid.UUID | None = None,
) -> list[DateRange]:
    query = (
        "select effective_start_date, effective_end_date from income "
        "where household_id = :household_id and individual = :individual and company = :company"
    )
    params: dict = {"household_id": household_id, "individual": individual, "company": company}
    if exclude_income_id is not None:
        query += " and income_id != :exclude_income_id"
        params["exclude_income_id"] = exclude_income_id
    rows = conn.execute(text(query), params).all()
    return [DateRange(r.effective_start_date, r.effective_end_date) for r in rows]


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
    if payload.effective_end_date < payload.effective_start_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="End date must be on or after the start date.")

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


@router.patch("/{income_id}", response_model=IncomeRead, status_code=status.HTTP_200_OK)
def update_income(
    income_id: uuid.UUID,
    payload: IncomeUpdate,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> IncomeRead:
    current = conn.execute(
        text("select income_id from income where income_id = :income_id and household_id = :household_id"),
        {"income_id": income_id, "household_id": session.household_id},
    ).mappings().first()
    if current is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    existing = _existing_ranges(
        conn, session.household_id, payload.individual, payload.company, exclude_income_id=income_id
    )
    try:
        validate_no_overlap(existing, DateRange(payload.effective_start_date, payload.effective_end_date))
    except OverlapError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))

    conn.execute(
        text(
            """
            update income set
                individual = :individual,
                company = :company,
                income = :income,
                effective_start_date = :start,
                effective_end_date = :end
            where income_id = :income_id and household_id = :household_id
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


@router.delete("/{income_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_income(
    income_id: uuid.UUID,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> None:
    conn.execute(
        text("delete from income where income_id = :id and household_id = :household_id"),
        {"id": income_id, "household_id": session.household_id},
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


def _all_income_records(conn: Connection, household_id: str) -> list[dict]:
    rows = conn.execute(
        text("select income, effective_start_date, effective_end_date from income where household_id = :household_id"),
        {"household_id": household_id},
    ).mappings().all()
    return [dict(r) for r in rows]


def _gross_annual_income_at(records: list[dict], as_of: date) -> Decimal:
    return sum(
        (r["income"] for r in records if r["effective_start_date"] <= as_of <= r["effective_end_date"]),
        Decimal(0),
    )


@router.get("/series", response_model=IncomeSeriesResponse)
def income_series(
    months: int = 24,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> IncomeSeriesResponse:
    """Gross (from the effective-dated income table, per CLAUDE.md's "household income at
    any point in time" definition) vs. Net (actual income-type transactions, month by month)
    — lets a household see how what they actually banked compares to their on-paper income.

    Fetches all income records and net-income-by-month ONCE (2 queries total), then computes
    every requested month's gross figure in memory — not one query per month, which used to
    mean `months + 2` sequential round trips to the DB for this one endpoint."""
    today = date.today()
    start = today - relativedelta(months=months)

    net_rows = conn.execute(
        text(
            """
            select to_char(date_trunc('month', date), 'YYYY-MM') as month,
                   sum(amount) as net
            from transactions
            where household_id = :household_id and type = 'income' and date >= :start
            group by date_trunc('month', date)
            """
        ),
        {"household_id": session.household_id, "start": start},
    ).mappings().all()
    net_by_month = {r["month"]: r["net"] for r in net_rows}
    income_records = _all_income_records(conn, session.household_id)

    points = []
    for i in range(months, -1, -1):
        cutoff = today - relativedelta(months=i)
        gross_monthly = _gross_annual_income_at(income_records, cutoff) / 12
        net_monthly = net_by_month.get(cutoff.strftime("%Y-%m"))

        diff_dollar = (gross_monthly - net_monthly) if net_monthly is not None else None
        diff_pct = (
            float((gross_monthly - net_monthly) / gross_monthly * 100)
            if net_monthly is not None and gross_monthly > 0
            else None
        )
        points.append(
            IncomeSeriesPoint(
                date=cutoff,
                gross_monthly=gross_monthly,
                net_monthly=net_monthly,
                diff_dollar=diff_dollar,
                diff_pct=diff_pct,
            )
        )

    return IncomeSeriesResponse(points=points)
