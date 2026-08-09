""""How much do you need to retire?" — projects today's income forward to retirement age,
sizes the nest egg needed to replace a chosen % of that income for the rest of your expected
lifetime (a present-value-of-annuity calc in REAL terms, i.e. net of inflation), then compares
that target against where your current savings are projected to land on their own. Distinct
from financial_independence.py's simpler "25x expenses" rule — this one is age/lifespan-aware
and income-projection-driven, matching calculator.net's model this tool is based on."""

from decimal import Decimal

from app.services.calculators._solve import bisect_decimal


def compute(
    current_age: int,
    retirement_age: int,
    current_income: Decimal,
    current_savings: Decimal,
    life_expectancy: int = 90,
    annual_income_increase: Decimal = Decimal("0.02"),
    income_replacement_pct: Decimal = Decimal("0.80"),
    avg_return: Decimal = Decimal("0.06"),
    inflation_rate: Decimal = Decimal("0.03"),
    other_income_monthly: Decimal = Decimal(0),
) -> dict:
    years_to_retirement = retirement_age - current_age
    years_in_retirement = life_expectancy - retirement_age
    if years_to_retirement <= 0 or years_in_retirement <= 0:
        return {"error": "Retirement age must be after current age, and before life expectancy."}

    income_at_retirement = current_income * (1 + annual_income_increase) ** years_to_retirement
    income_needed_annual = income_at_retirement * income_replacement_pct
    other_income_annual = other_income_monthly * 12
    net_need_annual = max(Decimal(0), income_needed_annual - other_income_annual)

    # Real (inflation-adjusted) return during the drawdown years — the nest egg only needs to
    # keep pace with inflation on top of what it pays out, not the full nominal return.
    real_rate = (1 + avg_return) / (1 + inflation_rate) - 1
    n = years_in_retirement
    if net_need_annual <= 0:
        required_balance = Decimal(0)
    elif real_rate == 0:
        required_balance = net_need_annual * n
    else:
        required_balance = net_need_annual * (1 - (1 + real_rate) ** (-n)) / real_rate

    projected_savings = current_savings * (1 + avg_return) ** years_to_retirement
    surplus_or_shortfall = projected_savings - required_balance

    required_additional_monthly_savings = Decimal(0)
    if surplus_or_shortfall < 0:
        shortfall = -surplus_or_shortfall
        months = years_to_retirement * 12
        monthly_rate = avg_return / 12
        if monthly_rate == 0:
            required_additional_monthly_savings = shortfall / months
        else:
            fv_factor = ((1 + monthly_rate) ** months - 1) / monthly_rate

            def fv_of_contribution(monthly: Decimal) -> Decimal:
                return monthly * fv_factor

            required_additional_monthly_savings = bisect_decimal(
                fv_of_contribution, shortfall, Decimal(0), shortfall
            )

    schedule = []
    balance = current_savings
    for age in range(current_age + 1, retirement_age + 1):
        balance = balance * (1 + avg_return)
        schedule.append({"age": age, "balance": round(balance, 2)})

    return {
        "required_balance": round(required_balance, 2),
        "projected_savings_at_retirement": round(projected_savings, 2),
        "surplus_or_shortfall": round(surplus_or_shortfall, 2),
        "on_track": surplus_or_shortfall >= 0,
        "required_additional_monthly_savings": round(required_additional_monthly_savings, 2),
        "income_needed_monthly": round(income_needed_annual / 12, 2),
        "net_need_monthly": round(net_need_annual / 12, 2),
        "schedule": schedule,
    }
