from datetime import date

from app.services.age import age_from_birthdate


def test_age_before_birthday_this_year():
    assert age_from_birthdate(date(1990, 6, 15), as_of=date(2026, 6, 14)) == 35


def test_age_on_birthday():
    assert age_from_birthdate(date(1990, 6, 15), as_of=date(2026, 6, 15)) == 36


def test_age_after_birthday_this_year():
    assert age_from_birthdate(date(1990, 6, 15), as_of=date(2026, 6, 16)) == 36


def test_age_leap_day_birthdate():
    assert age_from_birthdate(date(2000, 2, 29), as_of=date(2026, 3, 1)) == 26
