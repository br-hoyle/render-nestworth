from datetime import date
from decimal import Decimal

from app.services.forward_fill import (
    Snapshot,
    daily_dates,
    forward_fill_series,
    is_stale,
    staleness_days,
)


def test_forward_fill_carries_last_value_forward():
    snapshots = [
        Snapshot(date(2026, 1, 1), Decimal("100")),
        Snapshot(date(2026, 1, 10), Decimal("150")),
    ]
    dates = daily_dates(date(2026, 1, 1), date(2026, 1, 15))
    points = forward_fill_series(snapshots, dates)

    by_date = {p.full_date: p for p in points}
    assert by_date[date(2026, 1, 1)].balance == Decimal("100")
    assert by_date[date(2026, 1, 1)].is_real is True
    assert by_date[date(2026, 1, 5)].balance == Decimal("100")
    assert by_date[date(2026, 1, 5)].is_real is False
    assert by_date[date(2026, 1, 10)].balance == Decimal("150")
    assert by_date[date(2026, 1, 10)].is_real is True
    assert by_date[date(2026, 1, 15)].balance == Decimal("150")
    assert by_date[date(2026, 1, 15)].is_real is False


def test_never_fabricates_before_first_snapshot():
    snapshots = [Snapshot(date(2026, 3, 1), Decimal("500"))]
    dates = daily_dates(date(2026, 1, 1), date(2026, 3, 5))
    points = forward_fill_series(snapshots, dates)

    assert all(p.full_date >= date(2026, 3, 1) for p in points)
    assert len(points) == 5  # Mar 1..5


def test_stops_at_account_effective_end():
    snapshots = [
        Snapshot(date(2026, 1, 1), Decimal("100")),
        Snapshot(date(2026, 2, 1), Decimal("200")),
    ]
    dates = daily_dates(date(2026, 1, 1), date(2026, 3, 1))
    points = forward_fill_series(snapshots, dates, account_effective_end=date(2026, 2, 15))

    assert max(p.full_date for p in points) == date(2026, 2, 15)
    # still carries the last real value (200) right up to the closure date
    assert points[-1].balance == Decimal("200")


def test_no_snapshots_returns_empty():
    assert forward_fill_series([], daily_dates(date(2026, 1, 1), date(2026, 1, 5))) == []


def test_staleness_days_and_is_stale():
    as_of = date(2026, 7, 29)
    assert staleness_days(None, as_of) is None
    assert is_stale(None, as_of, threshold_days=30) is True

    assert staleness_days(date(2026, 7, 1), as_of) == 28
    assert is_stale(date(2026, 7, 1), as_of, threshold_days=30) is False
    assert is_stale(date(2026, 6, 1), as_of, threshold_days=30) is True
