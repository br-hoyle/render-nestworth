import uuid
from datetime import date
from decimal import Decimal

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
