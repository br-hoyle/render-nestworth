from datetime import date

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_current_session, get_tenant_db
from app.schemas.cashflow import CategoryMonthPoint, CategoryTrend

router = APIRouter(prefix="/cashflow", tags=["cashflow"])


@router.get("/category-trends", response_model=list[CategoryTrend])
def category_trends(
    months: int = 12,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> list[CategoryTrend]:
    """Monthly expense sums per group over a trailing window, plus a simple drift signal:
    the most recent month vs. the prior 3-month average, as a % change. Used by the
    Cash flow page's "category velocity/drift" section."""
    today = date.today()
    start = today - relativedelta(months=months)

    rows = conn.execute(
        text(
            """
            select coalesce("group", 'Other') as "group",
                   to_char(date_trunc('month', date), 'YYYY-MM') as month,
                   sum(-amount) as amount
            from transactions
            where household_id = :household_id and type = 'expense' and date >= :start
            group by coalesce("group", 'Other'), date_trunc('month', date)
            order by "group", month
            """
        ),
        {"household_id": session.household_id, "start": start},
    ).mappings().all()

    by_group: dict[str, list[CategoryMonthPoint]] = {}
    for row in rows:
        by_group.setdefault(row["group"], []).append(
            CategoryMonthPoint(month=row["month"], amount=row["amount"])
        )

    trends = []
    for group, points in by_group.items():
        drift = None
        if len(points) >= 2:
            latest = float(points[-1].amount)
            prior = points[max(0, len(points) - 4) : len(points) - 1]
            prior_avg = sum(float(p.amount) for p in prior) / len(prior) if prior else None
            if prior_avg:
                drift = (latest - prior_avg) / prior_avg * 100
        trends.append(CategoryTrend(group=group, points=points, drift_pct=drift))

    return sorted(trends, key=lambda t: sum(float(p.amount) for p in t.points), reverse=True)
