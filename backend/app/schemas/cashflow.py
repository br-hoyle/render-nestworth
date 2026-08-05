from decimal import Decimal

from pydantic import BaseModel


class CategoryMonthPoint(BaseModel):
    month: str
    amount: Decimal


class CategoryTrend(BaseModel):
    label: str  # group name, or item name (bare if scoped to one group, "Group · Item" otherwise)
    points: list[CategoryMonthPoint]
    ratio_pct: float | None  # current month ÷ trailing 6-month average × 100 (100% = on pace)
