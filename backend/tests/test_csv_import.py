from datetime import date
from decimal import Decimal

from app.services.csv_import import (
    compute_fingerprint,
    detect_headers,
    headers_match_expected,
    parse_and_classify,
)

SAMPLE_CSV = """Group,Item,Type,Date,Merchant,Account,Amount,Note
Income,Paycheck,income,06/03/2026,Acme Co,Chase •1234,6875.00,
Food,Groceries,expense,06/02/2026,Kroger,Chase •1234,-142.36,
Fun,Dining,expense,06/07/2026,Local Bistro,,12.5o,
"""


def test_headers_match_expected():
    headers = detect_headers(SAMPLE_CSV)
    assert headers_match_expected(headers) is True


def test_headers_mismatch_detected():
    assert headers_match_expected(["Date", "Amount"]) is False


def test_parse_and_classify_separates_new_and_errors():
    new_rows, dupes, errors = parse_and_classify(SAMPLE_CSV, "hh-1", existing_fingerprints=set())
    assert len(new_rows) == 2
    assert len(dupes) == 0
    assert len(errors) == 1
    assert errors[0].reason == "unparseable amount"
    assert errors[0].row_number == 4


def test_parse_and_classify_flags_existing_fingerprint_as_dupe():
    fp = compute_fingerprint("hh-1", date(2026, 6, 3), "Acme Co", Decimal("6875.00"), "")
    new_rows, dupes, errors = parse_and_classify(SAMPLE_CSV, "hh-1", existing_fingerprints={fp})
    assert len(new_rows) == 1
    assert len(dupes) == 1
    assert dupes[0].merchant == "Acme Co"


def test_parse_and_classify_dedupes_within_same_batch():
    csv_text = (
        "Group,Item,Type,Date,Merchant,Account,Amount,Note\n"
        "Food,Groceries,expense,06/02/2026,Kroger,Chase,-50.00,\n"
        "Food,Groceries,expense,06/02/2026,Kroger,Chase,-50.00,\n"
    )
    new_rows, dupes, errors = parse_and_classify(csv_text, "hh-1", existing_fingerprints=set())
    assert len(new_rows) == 1
    assert len(dupes) == 1


def test_parse_and_classify_rejects_bad_type():
    csv_text = "Group,Item,Type,Date,Merchant,Account,Amount,Note\nFood,Groceries,expensee,06/02/2026,Kroger,Chase,-50.00,\n"
    new_rows, dupes, errors = parse_and_classify(csv_text, "hh-1", existing_fingerprints=set())
    assert len(new_rows) == 0
    assert len(errors) == 1
    assert "type" in errors[0].reason


def test_fingerprint_is_stable_and_case_insensitive_on_merchant():
    fp1 = compute_fingerprint("hh-1", date(2026, 1, 1), "Kroger", Decimal("-10.00"), "note")
    fp2 = compute_fingerprint("hh-1", date(2026, 1, 1), "KROGER", Decimal("-10.00"), "NOTE")
    assert fp1 == fp2


def test_column_mapping_fallback():
    csv_text = "TxnDate,Payee,Amt,Category,Sub,Kind,Bank,Memo\n06/02/2026,Kroger,-50.00,Food,Groceries,expense,Chase,\n"
    mapping = {
        "Date": "TxnDate",
        "Merchant": "Payee",
        "Amount": "Amt",
        "Group": "Category",
        "Item": "Sub",
        "Type": "Kind",
        "Account": "Bank",
        "Note": "Memo",
    }
    new_rows, dupes, errors = parse_and_classify(
        csv_text, "hh-1", existing_fingerprints=set(), column_mapping=mapping
    )
    assert len(new_rows) == 1
    assert new_rows[0].merchant == "Kroger"
