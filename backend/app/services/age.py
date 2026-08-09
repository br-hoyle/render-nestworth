"""Age from birthdate — a pure, DB-free function (matches forward_fill.py's convention for
small business-logic pieces worth isolating and unit-testing on their own), so the
household_age used across the retirement/FI KPI projections can be derived automatically
rather than re-entered by hand every year."""

from datetime import date

from dateutil.relativedelta import relativedelta


def age_from_birthdate(birthdate: date, as_of: date | None = None) -> int:
    return relativedelta(as_of or date.today(), birthdate).years
