import uuid
import datetime
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class PreviewRow(BaseModel):
    row_number: int
    date: date
    group: str
    item: str
    type: str
    merchant: str
    account_name: str
    amount: Decimal
    note: str
    fingerprint: str


class PreviewErrorRow(BaseModel):
    row_number: int
    raw: dict
    reason: str


class ImportPreviewResponse(BaseModel):
    source_file: str
    needs_mapping: bool = False
    detected_headers: list[str] = []
    new_rows: list[PreviewRow] = []
    duplicate_rows: list[PreviewRow] = []
    errors: list[PreviewErrorRow] = []


class ImportCommitRequest(BaseModel):
    source_file: str
    rows: list[PreviewRow]


class ImportCommitResponse(BaseModel):
    inserted_count: int
    source_file: str


class TransactionRead(BaseModel):
    transaction_id: uuid.UUID
    date: date
    group: str | None
    item: str | None
    type: str
    merchant: str | None
    account_name: str | None
    amount: Decimal
    note: str | None
    source_file: str | None


class TransactionListResponse(BaseModel):
    items: list[TransactionRead]
    total: int


class TransactionCreate(BaseModel):
    date: date
    group: str | None = None
    item: str | None = None
    type: Literal["income", "expense"]
    merchant: str | None = None
    account_name: str | None = None
    amount: Decimal
    note: str | None = None


class TransactionUpdate(BaseModel):
    # NOTE: annotated as `datetime.date` (not bare `date`) — `date: date | None = None` is a
    # real Python gotcha: since the target name equals the type name, the `= None` value gets
    # stored to the name `date` *before* the annotation `date | None` is evaluated, silently
    # turning it into `None | None` and raising a TypeError at class-definition time.
    date: datetime.date | None = None
    group: str | None = None
    item: str | None = None
    type: str | None = None
    merchant: str | None = None
    account_name: str | None = None
    amount: Decimal | None = None
    note: str | None = None


class TransactionCategoryRule(BaseModel):
    group: str
    item: str = ""
    flow_type: str


class UnclassifiedGroup(BaseModel):
    group: str
    item: str
    count: int
    total_amount: Decimal


class CategorySummaryRow(UnclassifiedGroup):
    flow_type: str | None = None
