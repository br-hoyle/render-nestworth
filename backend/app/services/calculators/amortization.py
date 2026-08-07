"""Amortization Calculator — full amortization schedule for a fixed-rate loan, with three
independent, optional extra-payment types layered on top: a recurring extra each month (from a
chosen start date), a recurring extra once a year (from a chosen start date), and a single
one-time extra (on a chosen date). All three may be used together. Compares the result against
the same loan with no extra payments at all, to report interest and time saved.

Each extra's "start at" is a calendar date rather than a raw month number — `_dates.py` converts
it to the whole-month offset from `start_date` that `_amortization.amortize()` consumes.

Replaces the old registry-only relabel of loan_calculator's generic amortized-loan math: this
calculator's whole point is the extra-payment scenarios that math never modeled."""

from datetime import date
from decimal import Decimal

from app.services.calculators._amortization import amortize
from app.services.calculators._dates import add_months, months_elapsed
from app.services.calculators.mortgage import monthly_payment


def compute(
    principal: Decimal,
    annual_rate: Decimal,
    term_years: int,
    start_date: date,
    extra_monthly: Decimal = Decimal(0),
    extra_monthly_start_date: date | None = None,
    extra_yearly: Decimal = Decimal(0),
    extra_yearly_start_date: date | None = None,
    extra_one_time: Decimal = Decimal(0),
    extra_one_time_date: date | None = None,
) -> dict:
    payment = monthly_payment(principal, annual_rate, term_years)

    extra_monthly_start_period = months_elapsed(start_date, extra_monthly_start_date) + 1 if extra_monthly_start_date else 1
    extra_yearly_start_period = months_elapsed(start_date, extra_yearly_start_date) + 1 if extra_yearly_start_date else 1
    extra_one_time_period = months_elapsed(start_date, extra_one_time_date) + 1 if extra_one_time_date else None

    baseline = amortize(principal, annual_rate, payment, payments_per_year=12)
    with_extra = amortize(
        principal,
        annual_rate,
        payment,
        payments_per_year=12,
        extra_monthly=extra_monthly,
        extra_monthly_start_period=extra_monthly_start_period,
        extra_yearly=extra_yearly,
        extra_yearly_start_period=extra_yearly_start_period,
        extra_one_time=extra_one_time,
        extra_one_time_period=extra_one_time_period,
    )

    baseline_months = baseline["periods_to_payoff"]
    with_extra_months = with_extra["periods_to_payoff"]
    months_saved = (
        None if baseline_months is None or with_extra_months is None else baseline_months - with_extra_months
    )
    payoff_date = add_months(start_date, with_extra_months) if with_extra_months is not None else None

    return {
        "monthly_payment": payment,
        "months_to_payoff": with_extra_months,
        "years_to_payoff": None if with_extra_months is None else round(Decimal(with_extra_months) / 12, 2),
        "payoff_date": payoff_date,
        "total_interest": with_extra["total_interest"],
        "total_paid": round(principal + with_extra["total_interest"], 2),
        "interest_saved": round(baseline["total_interest"] - with_extra["total_interest"], 2),
        "months_saved": months_saved,
        "yearly_schedule": with_extra["yearly_schedule"],
    }
