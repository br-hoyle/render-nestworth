"""
Pure, DB-free helpers for the two Type-2-slowly-changing-dimension-ish tables (accounts,
income): validating a new effective-dated row's window doesn't collide with existing ones,
and computing the "close the previous row the day before" fix.

No fabrication of history: these functions only validate/compute date arithmetic. The
actual close-then-insert write happens in the router, inside one DB transaction.
"""

from dataclasses import dataclass
from datetime import date, timedelta

OPEN_ENDED_SENTINEL = date(9999, 12, 31)


@dataclass(frozen=True)
class DateRange:
    start: date
    end: date  # OPEN_ENDED_SENTINEL means "still open"


class OverlapError(ValueError):
    def __init__(self, conflicting: DateRange):
        self.conflicting = conflicting
        super().__init__(
            f"Overlaps an existing record from {conflicting.start} to "
            f"{'open' if conflicting.end == OPEN_ENDED_SENTINEL else conflicting.end}"
        )


def ranges_overlap(a: DateRange, b: DateRange) -> bool:
    return a.start <= b.end and b.start <= a.end


def validate_no_overlap(existing: list[DateRange], new_range: DateRange) -> None:
    if new_range.end < new_range.start:
        raise ValueError("End date must be on or after the start date.")
    for existing_range in existing:
        if ranges_overlap(existing_range, new_range):
            raise OverlapError(existing_range)


def day_before(d: date) -> date:
    return d - timedelta(days=1)


def find_conflict(existing: list[DateRange], new_range: DateRange) -> DateRange | None:
    """Returns the first existing range that would conflict with new_range, or None."""
    for existing_range in existing:
        if ranges_overlap(existing_range, new_range):
            return existing_range
    return None


def resolve_by_ending_previous_the_day_before(
    conflicting: DateRange, new_start: date
) -> date:
    """The "end the previous record the day before" one-click fix from the wireframe.
    Only valid when the conflicting record starts on/before new_start (i.e. new_start falls
    inside or after it) — otherwise there's nothing sensible to truncate."""
    if conflicting.start > new_start:
        raise ValueError("The conflicting record starts after the new record — can't resolve this way.")
    return day_before(new_start)
