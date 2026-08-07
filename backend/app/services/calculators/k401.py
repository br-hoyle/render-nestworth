"""401(k) Calculator — projects a 401(k) balance to retirement (annual salary growth, a flat
employee contribution % of salary, and an employer match up to a limit %), then reports the
sustainable monthly income it could support in retirement. No explicit withdrawal-rate input
is given in this calculator's spec (unlike the standalone Retirement Withdrawal calculator),
so the payout figure is estimated the same way retirement_withdrawal.py does: the fixed real
(inflation-adjusted) monthly payment that exactly depletes the balance by life expectancy —
documented here as the assumption, since the alternative (a raw balance-at-retirement number
with no sense of "how long that lasts") is less useful to a household planning around it."""

from decimal import Decimal

from app.services.calculators.mortgage import monthly_payment as _annuity_payment


def compute(
    current_age: int,
    annual_income: Decimal,
    retirement_age: int,
    current_balance: Decimal = Decimal(0),
    contribution_pct: Decimal = Decimal("0.06"),
    employer_match_pct: Decimal = Decimal("0.50"),
    employer_match_limit_pct: Decimal = Decimal("0.06"),
    life_expectancy: int = 90,
    annual_income_increase: Decimal = Decimal("0.02"),
    avg_return: Decimal = Decimal("0.07"),
    inflation_rate: Decimal = Decimal("0.03"),
) -> dict:
    years_to_retirement = retirement_age - current_age
    years_in_retirement = life_expectancy - retirement_age
    if years_to_retirement <= 0 or years_in_retirement <= 0:
        return {"error": "Retirement age must be after current age, and before life expectancy."}

    balance = current_balance
    income = annual_income
    total_employee_contributions = Decimal(0)
    total_employer_match = Decimal(0)
    schedule = []

    for age in range(current_age + 1, retirement_age + 1):
        employee_contribution = income * contribution_pct
        matched_pct = min(contribution_pct, employer_match_limit_pct)
        employer_contribution = income * matched_pct * employer_match_pct
        balance = balance * (1 + avg_return) + employee_contribution + employer_contribution
        total_employee_contributions += employee_contribution
        total_employer_match += employer_contribution
        income = income * (1 + annual_income_increase)
        schedule.append(
            {
                "age": age,
                "balance": round(balance, 2),
                "starting_balance": round(current_balance, 2),
                "contributions_to_date": round(total_employee_contributions + total_employer_match, 2),
            }
        )

    balance_at_retirement = balance
    real_rate = (1 + avg_return) / (1 + inflation_rate) - 1
    sustainable_monthly_income = _annuity_payment(balance_at_retirement, real_rate, years_in_retirement)

    return {
        "balance_at_retirement": round(balance_at_retirement, 2),
        "total_employee_contributions": round(total_employee_contributions, 2),
        "total_employer_match": round(total_employer_match, 2),
        "sustainable_monthly_income": round(sustainable_monthly_income, 2),
        "schedule": schedule,
    }
