import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

OPEN_ENDED = date(9999, 12, 31)


class AccountBase(BaseModel):
    balance_type: Literal["asset", "liability"]
    institution_name: str
    category: str
    account_type: str
    account_name: str


class AccountCreate(AccountBase):
    effective_start_date: date


class AccountRevise(AccountBase):
    """Submitted as an edit to an existing (open) account row. Closes that row and opens
    a new one — never an in-place update."""

    new_revision_start_date: date


class AccountClose(BaseModel):
    effective_end_date: date


class AccountRead(AccountBase):
    account_id: uuid.UUID
    effective_start_date: date
    effective_end_date: date
    is_open: bool
    latest_balance: Decimal | None = None


class StaleAccountInfo(BaseModel):
    account_id: uuid.UUID
    account_name: str
    last_real_date: date | None
    days_stale: int | None
    is_stale: bool


class SparklinePoint(BaseModel):
    full_date: date
    balance: Decimal


class AccountSparkline(BaseModel):
    account_id: uuid.UUID
    points: list[SparklinePoint]
