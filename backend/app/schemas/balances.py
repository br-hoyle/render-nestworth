import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class BalanceUpsert(BaseModel):
    account_id: uuid.UUID
    full_date: date
    balance: Decimal


class BalanceRead(BaseModel):
    balance_id: uuid.UUID
    account_id: uuid.UUID
    full_date: date
    balance: Decimal


class SeriesPoint(BaseModel):
    full_date: date
    balance: Decimal
    is_real: bool


class AccountSeries(BaseModel):
    account_id: uuid.UUID
    account_name: str
    balance_type: str
    points: list[SeriesPoint]


class NetWorthPoint(BaseModel):
    full_date: date
    assets: Decimal
    liabilities: Decimal
    net_worth: Decimal
