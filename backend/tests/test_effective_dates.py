from datetime import date

import pytest

from app.services.effective_dates import (
    DateRange,
    OPEN_ENDED_SENTINEL,
    OverlapError,
    day_before,
    find_conflict,
    ranges_overlap,
    resolve_by_ending_previous_the_day_before,
    validate_no_overlap,
)


def test_ranges_overlap_true_for_contained_range():
    a = DateRange(date(2020, 1, 1), date(2025, 1, 1))
    b = DateRange(date(2021, 1, 1), date(2022, 1, 1))
    assert ranges_overlap(a, b) is True


def test_ranges_overlap_false_for_adjacent_ranges():
    a = DateRange(date(2020, 1, 1), date(2020, 12, 31))
    b = DateRange(date(2021, 1, 1), OPEN_ENDED_SENTINEL)
    assert ranges_overlap(a, b) is False


def test_validate_no_overlap_raises_on_collision():
    existing = [DateRange(date(2019, 6, 1), date(2023, 8, 31))]
    with pytest.raises(OverlapError):
        validate_no_overlap(existing, DateRange(date(2023, 1, 1), OPEN_ENDED_SENTINEL))


def test_validate_no_overlap_passes_for_sequential_ranges():
    existing = [DateRange(date(2019, 6, 1), date(2023, 8, 31))]
    # Should not raise.
    validate_no_overlap(existing, DateRange(date(2023, 9, 1), OPEN_ENDED_SENTINEL))


def test_validate_no_overlap_rejects_end_before_start():
    with pytest.raises(ValueError):
        validate_no_overlap([], DateRange(date(2026, 1, 1), date(2025, 1, 1)))


def test_day_before():
    assert day_before(date(2026, 3, 1)) == date(2026, 2, 28)


def test_find_conflict_returns_first_match():
    existing = [
        DateRange(date(2019, 6, 1), date(2020, 1, 1)),
        DateRange(date(2021, 1, 1), date(2022, 1, 1)),
    ]
    conflict = find_conflict(existing, DateRange(date(2021, 6, 1), OPEN_ENDED_SENTINEL))
    assert conflict == existing[1]


def test_resolve_by_ending_previous_the_day_before():
    conflicting = DateRange(date(2021, 1, 1), OPEN_ENDED_SENTINEL)
    new_start = date(2024, 4, 1)
    assert resolve_by_ending_previous_the_day_before(conflicting, new_start) == date(2024, 3, 31)


def test_resolve_by_ending_previous_raises_when_conflict_starts_after():
    conflicting = DateRange(date(2025, 1, 1), OPEN_ENDED_SENTINEL)
    with pytest.raises(ValueError):
        resolve_by_ending_previous_the_day_before(conflicting, date(2024, 1, 1))
