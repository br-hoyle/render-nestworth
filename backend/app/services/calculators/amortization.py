"""Amortization Calculator — full amortization schedule for a fixed-rate loan, with three
independent, optional extra-payment types layered on top: a recurring extra each month (from a
chosen start month), a recurring extra once a year (from a chosen start month), and a single
one-time extra (in a chosen month). All three may be used together. Compares the result against
the same loan with no extra payments at all, to report interest and time saved.

Replaces the old registry-only relabel of loan_calculator's generic amortized-loan math: this
calculator's whole point is the extra-payment scenarios that math never modeled."""

from decimal import Decimal

from app.services.calculators._amortization import amortize
from app.services.calculators.mortgage import monthly_payment


def compute(
    principal: Decimal,
    annual_rate: Decimal,
    term_years: int,
    extra_monthly: Decimal = Decimal(0),
    extra_monthly_start_month: int = 1,
    extra_yearly: Decimal = Decimal(0),
    extra_yearly_start_month: int = 12,
    extra_one_time: Decimal = Decimal(0),
    extra_one_time_month: int | None = None,
) -> dict:
    payment = monthly_payment(principal, annual_rate, term_years)

    baseline = amortize(principal, annual_rate, payment, payments_per_year=12)
    with_extra = amortize(
        principal,
        annual_rate,
        payment,
        payments_per_year=12,
        extra_monthly=extra_monthly,
        extra_monthly_start_period=extra_monthly_start_month,
        extra_yearly=extra_yearly,
        extra_yearly_start_period=extra_yearly_start_month,
        extra_one_time=extra_one_time,
        extra_one_time_period=extra_one_time_month,
    )

    baseline_months = baseline["periods_to_payoff"]
    with_extra_months = with_extra["periods_to_payoff"]
    months_saved = (
        None if baseline_months is None or with_extra_months is None else baseline_months - with_extra_months
    )

    return {
        "monthly_payment": payment,
        "months_to_payoff": with_extra_months,
        "years_to_payoff": None if with_extra_months is None else round(Decimal(with_extra_months) / 12, 2),
        "total_interest": with_extra["total_interest"],
        "total_paid": round(principal + with_extra["total_interest"], 2),
        "interest_saved": round(baseline["total_interest"] - with_extra["total_interest"], 2),
        "months_saved": months_saved,
        "yearly_schedule": with_extra["yearly_schedule"],
    }
