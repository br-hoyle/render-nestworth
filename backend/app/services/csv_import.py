"""
EveryDollar-style CSV parsing for the transactions import pipeline. Pure functions only —
no DB access — so parsing/validation/dedup-fingerprinting can be unit tested without a
database. The three-phase pipeline (parse/map -> preview -> commit) lives in
routers/transactions.py; this module only does the parse+classify step.
"""

import csv
import hashlib
import io
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

EXPECTED_HEADERS = ["Group", "Item", "Type", "Date", "Merchant", "Account", "Amount", "Note"]

_DATE_FORMATS = ["%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"]


@dataclass
class ParsedRow:
    row_number: int
    date: date
    group: str
    item: str
    type: str  # "income" | "expense"
    merchant: str
    account_name: str
    amount: Decimal
    note: str
    fingerprint: str


@dataclass
class RowError:
    row_number: int
    raw: dict
    reason: str


def compute_fingerprint(household_id: str, txn_date: date, merchant: str, amount: Decimal, note: str) -> str:
    basis = f"{household_id}|{txn_date.isoformat()}|{merchant.strip().lower()}|{amount}|{note.strip().lower()}"
    return hashlib.sha256(basis.encode()).hexdigest()


def _parse_date(raw: str) -> date | None:
    raw = raw.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _parse_amount(raw: str) -> Decimal | None:
    cleaned = raw.strip().replace("$", "").replace(",", "")
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def detect_headers(csv_text: str) -> list[str]:
    reader = csv.reader(io.StringIO(csv_text))
    try:
        return next(reader)
    except StopIteration:
        return []


def headers_match_expected(headers: list[str]) -> bool:
    return [h.strip() for h in headers] == EXPECTED_HEADERS


def parse_and_classify(
    csv_text: str,
    household_id: str,
    existing_fingerprints: set[str],
    column_mapping: dict[str, str] | None = None,
) -> tuple[list[ParsedRow], list[ParsedRow], list[RowError]]:
    """Returns (new_rows, duplicate_rows, errors). Dedup is checked both against
    existing_fingerprints (already in the DB) and against earlier rows in this same file."""
    reader = csv.DictReader(io.StringIO(csv_text))

    def col(raw_row: dict, expected: str) -> str:
        key = column_mapping.get(expected, expected) if column_mapping else expected
        return (raw_row.get(key) or "").strip()

    new_rows: list[ParsedRow] = []
    dupe_rows: list[ParsedRow] = []
    errors: list[RowError] = []
    seen_in_batch: set[str] = set()

    for i, raw_row in enumerate(reader, start=2):  # row 1 is the header
        txn_date = _parse_date(col(raw_row, "Date"))
        amount = _parse_amount(col(raw_row, "Amount"))
        merchant = col(raw_row, "Merchant")
        note = col(raw_row, "Note")
        txn_type = col(raw_row, "Type").lower()

        if txn_date is None:
            errors.append(RowError(i, raw_row, "unparseable date"))
            continue
        if amount is None:
            errors.append(RowError(i, raw_row, "unparseable amount"))
            continue
        if txn_type not in ("income", "expense"):
            errors.append(RowError(i, raw_row, "type must be 'income' or 'expense'"))
            continue

        fingerprint = compute_fingerprint(household_id, txn_date, merchant, amount, note)
        parsed = ParsedRow(
            row_number=i,
            date=txn_date,
            group=col(raw_row, "Group"),
            item=col(raw_row, "Item"),
            type=txn_type,
            merchant=merchant,
            account_name=col(raw_row, "Account"),
            amount=amount,
            note=note,
            fingerprint=fingerprint,
        )

        if fingerprint in existing_fingerprints or fingerprint in seen_in_batch:
            dupe_rows.append(parsed)
        else:
            seen_in_batch.add(fingerprint)
            new_rows.append(parsed)

    return new_rows, dupe_rows, errors
