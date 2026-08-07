"""Mortgage Payoff Calculator — for a loan already in progress (known original terms, known
remaining term), figures out today's balance by replaying the original amortization schedule
up to now, then compares four ways to finish paying it off:

- lump_sum: pay off the current balance today — no more interest accrues.
- extra_payments: continue at the original payment, plus the same three optional extra-payment
  types as the Amortization Calculator (monthly/yearly/one-time), reusing _amortization.amortize.
- biweekly: pay half the original monthly payment every two weeks instead (26 payments/year,
  i.e. the equivalent of 13 monthly payments/year) — the standard biweekly-acceleration trick,
  modeled by re-running the engine at payments_per_year=26 with interest accruing at
  annual_rate/26 per period. This is an approximation (real biweekly billing cycles don't line
  up with exact 1/26-year periods) but is the same simplification calculator.net's version uses.
- normal: continue exactly on the original schedule — the baseline every other option is
  compared against.

All four report interest saved and time saved relative to `normal`."""

from decimal import Decimal

from app.services.calculators._amortization import amortize
from app.services.calculators.mortgage import monthly_payment


def compute(
    original_principal: Decimal,
    original_term_years: int,
    annual_rate: Decimal,
    remaining_term_years: int,
    remaining_term_months: int,
    repayment_option: str = "normal",
    extra_monthly: Decimal = Decimal(0),
    extra_monthly_start_month: int = 1,
    extra_yearly: Decimal = Decimal(0),
    extra_yearly_start_month: int = 12,
    extra_one_time: Decimal = Decimal(0),
    extra_one_time_month: int | None = None,
) -> dict:
    payment = monthly_payment(original_principal, annual_rate, original_term_years)
    original_schedule = amortize(original_principal, annual_rate, payment, payments_per_year=12)
    original_periods = original_schedule["periods"]

    remaining_months = remaining_term_years * 12 + remaining_term_months
    elapsed_months = max(0, original_term_years * 12 - remaining_months)

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

    if repayment_option == "lump_sum":
        return {
            "current_balance": round(current_balance, 2),
            "payoff_amount_today": round(current_balance, 2),
            "total_interest": Decimal(0),
            "interest_saved": round(normal_total_interest, 2),
            "months_saved": normal_months,
            "yearly_schedule": [],
        }

    if repayment_option == "normal":
        result = {"periods_to_payoff": normal_months, "total_interest": round(normal_total_interest, 2)}
        yearly_schedule = amortize(current_balance, annual_rate, payment, payments_per_year=12)["yearly_schedule"]
    elif repayment_option == "extra_payments":
        result = amortize(
            current_balance,
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
        yearly_schedule = result["yearly_schedule"]
    elif repayment_option == "biweekly":
        result = amortize(current_balance, annual_rate, payment / 2, payments_per_year=26)
        yearly_schedule = result["yearly_schedule"]
    else:
        return {"error": f"Unknown repayment option: {repayment_option}"}

    months_to_payoff = result["periods_to_payoff"]
    if repayment_option == "biweekly" and months_to_payoff is not None:
        months_to_payoff = round(months_to_payoff * 12 / 26)

    return {
        "current_balance": round(current_balance, 2),
        "months_to_payoff": months_to_payoff,
        "years_to_payoff": None if months_to_payoff is None else round(Decimal(months_to_payoff) / 12, 2),
        "total_interest": result["total_interest"],
        "interest_saved": round(normal_total_interest - result["total_interest"], 2),
        "months_saved": None if months_to_payoff is None else normal_months - months_to_payoff,
        "yearly_schedule": yearly_schedule,
    }
