""""How much can you withdraw after retirement?" — accumulates savings (with contributions) to
retirement age, then solves for the fixed monthly withdrawal — held constant in TODAY's
purchasing power, i.e. computed against the real (inflation-adjusted) return — that exactly
depletes the balance by life expectancy. The payout side of the same annuity-payment formula
mortgage.py uses for loan payments (reused directly via mortgage.monthly_payment: paying a
balance down to zero over N years at a fixed rate is mathematically identical whether the
"balance" is a loan or a nest egg)."""

from decimal import Decimal

from app.services.calculators.mortgage import monthly_payment as _annuity_payment


def compute(
    current_age: int,
    retirement_age: int,
    current_retirement_savings: Decimal = Decimal(0),
    monthly_contribution: Decimal = Decimal(0),
    life_expectancy: int = 90,
    avg_investment_return: Decimal = Decimal("0.06"),
    inflation_rate: Decimal = Decimal("0.03"),
) -> dict:
    years_to_retirement = retirement_age - current_age
    years_in_retirement = life_expectancy - retirement_age
    if years_to_retirement <= 0 or years_in_retirement <= 0:
        return {"error": "Retirement age must be after current age, and before life expectancy."}

    monthly_rate = avg_investment_return / 12
    balance = current_retirement_savings
    schedule = []
    for age in range(current_age + 1, retirement_age + 1):
        for _ in range(12):
            balance = balance * (1 + monthly_rate) + monthly_contribution
        schedule.append({"age": age, "balance": round(balance, 2), "phase": "accumulation"})

    balance_at_retirement = balance
    real_rate = (1 + avg_investment_return) / (1 + inflation_rate) - 1
    sustainable_monthly_withdrawal = _annuity_payment(balance_at_retirement, real_rate, years_in_retirement)

    draw_balance = balance_at_retirement
    real_monthly_rate = real_rate / 12
    for age in range(retirement_age + 1, life_expectancy + 1):
        for _ in range(12):
            draw_balance = draw_balance * (1 + real_monthly_rate) - sustainable_monthly_withdrawal
        schedule.append({"age": age, "balance": round(max(draw_balance, Decimal(0)), 2), "phase": "drawdown"})

    return {
        "balance_at_retirement": round(balance_at_retirement, 2),
        "sustainable_monthly_withdrawal": round(sustainable_monthly_withdrawal, 2),
        "schedule": schedule,
    }
