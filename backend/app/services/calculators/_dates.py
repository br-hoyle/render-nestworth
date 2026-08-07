"""Calendar-date helpers shared by the Housing & Mortgage calculators — converts a household's
picked "start this extra payment on this date" calendar date into the whole-period offset
`_amortization.amortize()` actually consumes, so the amortization engine itself never needs to
know about calendar dates."""

from datetime import date
from decimal import Decimal


def add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(d.day, 28))


def months_elapsed(start: date, target: date) -> int:
    """Whole calendar months from `start` to `target`, clamped to at least 0."""
    months = (target.year - start.year) * 12 + (target.month - start.month)
    if target.day < start.day:
        months -= 1
    return max(0, months)


def periods_elapsed(start: date, target: date, payments_per_year: int) -> int:
    """Whole periods of the given cadence from `start` to `target`, clamped to at least 0.
    Monthly cadence (12/yr) uses exact calendar months; any other cadence (e.g. biweekly)
    approximates with a fixed days-per-period, which is exact enough for turning a picked
    calendar date into a plausible starting period."""
    if payments_per_year == 12:
        return months_elapsed(start, target)
    days_per_period = Decimal(365) / payments_per_year
    return max(0, int((target - start).days / days_per_period))
