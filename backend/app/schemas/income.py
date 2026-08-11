import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class IncomeCreate(BaseModel):
    individual: str
    company: str
    income: Decimal
    effective_start_date: date
    effective_end_date: date = date(9999, 12, 31)


class IncomeUpdate(BaseModel):
    individual: str
    company: str
    income: Decimal
    effective_start_date: date
    effective_end_date: date


class IncomeRead(BaseModel):
    income_id: uuid.UUID
    individual: str
    company: str
    income: Decimal
    effective_start_date: date
    effective_end_date: date
    is_open: bool


class IncomeConflict(BaseModel):
    income_id: uuid.UUID
    individual: str
    company: str
    effective_start_date: date
    effective_end_date: date
    suggested_resolution_end_date: date | None = None


class IncomeEndRequest(BaseModel):
    effective_end_date: date


class IncomeSummary(BaseModel):
    as_of: date
    total_annual_income: Decimal
    by_individual: dict[str, Decimal]


class IncomeSeriesPoint(BaseModel):
    date: date
    gross_monthly: Decimal
    net_monthly: Decimal | None
    diff_dollar: Decimal | None
    diff_pct: float | None


class IncomeSeriesResponse(BaseModel):
    points: list[IncomeSeriesPoint]
