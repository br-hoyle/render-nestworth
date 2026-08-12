""""How much will you have at retirement?" — projects current retirement savings forward with
a fixed monthly contribution and compounding investment return, straight to retirement age. The
mirror image of retirement_savings_plan.py: that one solves for the contribution needed to hit a
target balance; this one takes the contribution as given and reports what it grows into."""

from decimal import Decimal


def compute(
    current_age: int,
    retirement_age: int,
    current_retirement_savings: Decimal = Decimal(0),
    monthly_contribution: Decimal = Decimal(0),
    avg_investment_return: Decimal = Decimal("0.10"),
) -> dict:
    years = retirement_age - current_age
    if years <= 0:
        return {"error": "Retirement age must be after current age."}

    monthly_rate = avg_investment_return / 12
    balance = current_retirement_savings
    schedule = []
    months_elapsed = 0
    for age in range(current_age + 1, retirement_age + 1):
        for _ in range(12):
            balance = balance * (1 + monthly_rate) + monthly_contribution
            months_elapsed += 1
        schedule.append(
            {
                "age": age,
                "balance": round(balance, 2),
                "starting_balance": round(current_retirement_savings, 2),
                "contributions_to_date": round(monthly_contribution * months_elapsed, 2),
            }
        )

    total_contributions = monthly_contribution * months_elapsed
    total_growth = balance - current_retirement_savings - total_contributions

    return {
        "balance_at_retirement": round(balance, 2),
        "total_contributions": round(total_contributions, 2),
        "total_growth": round(total_growth, 2),
        "schedule": schedule,
    }
