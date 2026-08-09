"""Mortgage Payoff Calculator — for a loan already in progress (known original terms, known
remaining term), figures out today's balance by replaying the original amortization schedule
up to now, then compares two ways to finish paying it off faster than the original schedule:

- extra_payments: continue at the original monthly payment, plus the same three optional
  extra-payment types as the Amortization Calculator (monthly/yearly/one-time), reusing
  _amortization.amortize.
- biweekly: pay half the original monthly payment every two weeks instead (26 payments/year,
  i.e. the equivalent of 13 monthly payments/year) — the standard biweekly-acceleration trick,
  modeled by re-running the engine at payments_per_year=26 with interest accruing at
  annual_rate/26 per period. On top of that base biweekly cadence, up to four more optional
  extras can be layered: an extra amount every single biweekly payment (`extra_biweekly`), plus
  the same monthly/yearly/one-time extras as the other mode (fired at their own calendar
  cadence regardless of the underlying biweekly payment frequency — see _amortization.amortize's
  `monthly_cadence_periods` generalization). This is an approximation (real biweekly billing
  cycles don't line up with exact 1/26-year periods) but is the same simplification
  calculator.net's version uses.

Every extra's "start at" is a calendar date rather than a raw period number; `_dates.py`
converts each into the period offset (relative to *today*, i.e. the start of whichever payoff
schedule is being simulated — not the original loan's start date) that
`_amortization.amortize()` consumes.

Both modes report interest saved and time saved relative to continuing the original loan
unmodified — that comparison is always computed internally (not exposed as its own mode)."""

from datetime import date
from decimal import Decimal

from app.services.calculators._amortization import amortize
from app.services.calculators._dates import add_months, periods_elapsed
from app.services.calculators.mortgage import monthly_payment


def compute(
    original_principal: Decimal,
    original_term_years: int,
    annual_rate: Decimal,
    start_date: date,
    remaining_term_years: int,
    remaining_term_months: int = 0,
    repayment_option: str = "extra_payments",
    extra_monthly: Decimal = Decimal(0),
    extra_monthly_start_date: date | None = None,
    extra_yearly: Decimal = Decimal(0),
    extra_yearly_start_date: date | None = None,
    extra_one_time: Decimal = Decimal(0),
    extra_one_time_date: date | None = None,
    extra_biweekly: Decimal = Decimal(0),
    extra_biweekly_start_date: date | None = None,
) -> dict:
    payment = monthly_payment(original_principal, annual_rate, original_term_years)
    original_schedule = amortize(original_principal, annual_rate, payment, payments_per_year=12)
    original_periods = original_schedule["periods"]

    remaining_months = remaining_term_years * 12 + remaining_term_months
    elapsed_months = max(0, original_term_years * 12 - remaining_months)
    today = add_months(start_date, elapsed_months)

    if elapsed_months <= 0:
        current_balance = original_principal
    elif elapsed_months >= len(original_periods):
        current_balance = Decimal(0)
    else:
        current_balance = original_periods[elapsed_months - 1]["balance"]

    if current_balance <= 0:
        return {"error": "This loan is already paid off given the original term and remaining term entered."}

    normal_remaining_periods = original_periods[elapsed_months:]
    normal_total_interest = sum((p["interest"] for p in normal_remaining_periods), Decimal(0))
    normal_months = len(normal_remaining_periods)

    if repayment_option == "extra_payments":
        result = amortize(
            current_balance,
            annual_rate,
            payment,
            payments_per_year=12,
            extra_monthly=extra_monthly,
            extra_monthly_start_period=periods_elapsed(today, extra_monthly_start_date, 12) + 1 if extra_monthly_start_date else 1,
            extra_yearly=extra_yearly,
            extra_yearly_start_period=periods_elapsed(today, extra_yearly_start_date, 12) + 1 if extra_yearly_start_date else 1,
            extra_one_time=extra_one_time,
            extra_one_time_period=periods_elapsed(today, extra_one_time_date, 12) + 1 if extra_one_time_date else None,
        )
        yearly_schedule = result["yearly_schedule"]
    elif repayment_option == "biweekly":
        result = amortize(
            current_balance,
            annual_rate,
            payment / 2,
            payments_per_year=26,
            extra_recurring=extra_biweekly,
            extra_recurring_start_period=periods_elapsed(today, extra_biweekly_start_date, 26) + 1 if extra_biweekly_start_date else 1,
            extra_monthly=extra_monthly,
            extra_monthly_start_period=periods_elapsed(today, extra_monthly_start_date, 26) + 1 if extra_monthly_start_date else 1,
            extra_yearly=extra_yearly,
            extra_yearly_start_period=periods_elapsed(today, extra_yearly_start_date, 26) + 1 if extra_yearly_start_date else 1,
            extra_one_time=extra_one_time,
            extra_one_time_period=periods_elapsed(today, extra_one_time_date, 26) + 1 if extra_one_time_date else None,
        )
        yearly_schedule = result["yearly_schedule"]
    else:
        return {"error": f"Unknown repayment option: {repayment_option}"}

    months_to_payoff = result["periods_to_payoff"]
    if repayment_option == "biweekly" and months_to_payoff is not None:
        months_to_payoff = round(months_to_payoff * 12 / 26)
    payoff_date = add_months(today, months_to_payoff) if months_to_payoff is not None else None

    return {
        "current_balance": round(current_balance, 2),
        "months_to_payoff": months_to_payoff,
        "years_to_payoff": None if months_to_payoff is None else round(Decimal(months_to_payoff) / 12, 2),
        "payoff_date": payoff_date,
        "total_interest": result["total_interest"],
        "interest_saved": round(normal_total_interest - result["total_interest"], 2),
        "months_saved": None if months_to_payoff is None else normal_months - months_to_payoff,
        "yearly_schedule": yearly_schedule,
    }
