from decimal import Decimal

from pydantic import BaseModel


class CategoryMonthPoint(BaseModel):
    month: str
    amount: Decimal


class CategoryTrend(BaseModel):
    group: str
    points: list[CategoryMonthPoint]
    drift_pct: float | None  # % change: most recent month vs. the prior 3-month average
