from datetime import date
from typing import Literal

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_current_session, get_tenant_db
from app.schemas.cashflow import CategoryMonthPoint, CategoryTrend
from app.services.cashflow_rules import EXCLUDED_CASHFLOW_GROUP

router = APIRouter(prefix="/cashflow", tags=["cashflow"])


@router.get("/category-trends", response_model=list[CategoryTrend])
def category_trends(
    months: int = 12,
    end: date | None = None,
    mode: Literal["group", "item"] = "group",
    group: str | None = None,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> list[CategoryTrend]:
    """Monthly expense sums per group (or per item, optionally scoped to one group), plus a
    pace signal: the current month as a % of the trailing 6-month average (100% = right on
    pace). Used by the Cash flow page's "category velocity/drift" section."""
    anchor = end or date.today()
    start = anchor - relativedelta(months=months)

    by_label: dict[str, list[CategoryMonthPoint]] = {}

    if mode == "item":
        rows = conn.execute(
            text(
                """
                select coalesce("group", 'Other') as "group",
                       coalesce(item, 'Other') as item,
                       to_char(date_trunc('month', date), 'YYYY-MM') as month,
                       sum(-amount) as amount
                from transactions
                where household_id = :household_id and type = 'expense' and date >= :start and date <= :end
                  and lower(trim(coalesce("group", ''))) <> :excluded_group
                  and (cast(:group as text) is null or coalesce("group", 'Other') = cast(:group as text))
                group by coalesce("group", 'Other'), coalesce(item, 'Other'), date_trunc('month', date)
                order by "group", item, month
                """
            ),
            {
                "household_id": session.household_id,
                "start": start,
                "end": anchor,
                "group": group,
                "excluded_group": EXCLUDED_CASHFLOW_GROUP,
            },
        ).mappings().all()
        for row in rows:
            label = row["item"] if group else f'{row["group"]} · {row["item"]}'
            by_label.setdefault(label, []).append(CategoryMonthPoint(month=row["month"], amount=row["amount"]))
    else:
        rows = conn.execute(
            text(
                """
                select coalesce("group", 'Other') as "group",
                       to_char(date_trunc('month', date), 'YYYY-MM') as month,
                       sum(-amount) as amount
                from transactions
                where household_id = :household_id and type = 'expense' and date >= :start and date <= :end
                  and lower(trim(coalesce("group", ''))) <> :excluded_group
                group by coalesce("group", 'Other'), date_trunc('month', date)
                order by "group", month
                """
            ),
            {"household_id": session.household_id, "start": start, "end": anchor, "excluded_group": EXCLUDED_CASHFLOW_GROUP},
        ).mappings().all()
        for row in rows:
            by_label.setdefault(row["group"], []).append(CategoryMonthPoint(month=row["month"], amount=row["amount"]))

    trends = []
    for label, points in by_label.items():
        ratio = None
        if len(points) >= 2:
            latest = float(points[-1].amount)
            prior = points[max(0, len(points) - 7) : len(points) - 1]  # trailing 6 months before the latest
            prior_avg = sum(float(p.amount) for p in prior) / len(prior) if prior else None
            if prior_avg:
                ratio = latest / prior_avg * 100
        trends.append(CategoryTrend(label=label, points=points, ratio_pct=ratio))

    return sorted(trends, key=lambda t: sum(float(p.amount) for p in t.points), reverse=True)
