""""How can you save for retirement?" — solves for the fixed monthly contribution needed to
reach a target balance by retirement age, given what's already saved. A future-value-of-
annuity inversion (closed-form when the return rate is nonzero, direct division when it's
zero)."""

from decimal import Decimal


def compute(
    current_age: int,
    retirement_age: int,
    amount_needed_at_retirement: Decimal,
    current_retirement_savings: Decimal = Decimal(0),
    avg_investment_return: Decimal = Decimal("0.06"),
) -> dict:
    years = retirement_age - current_age
    if years <= 0:
        return {"error": "Retirement age must be after current age."}

    months = years * 12
    monthly_rate = avg_investment_return / 12
    projected_from_current = current_retirement_savings * (1 + monthly_rate) ** months
    remaining_need = amount_needed_at_retirement - projected_from_current

    if remaining_need <= 0:
        required_monthly_contribution = Decimal(0)
    elif monthly_rate == 0:
        required_monthly_contribution = remaining_need / months
    else:
        fv_factor = ((1 + monthly_rate) ** months - 1) / monthly_rate
        required_monthly_contribution = remaining_need / fv_factor

    schedule = []
    balance = current_retirement_savings
    monthly_contribution = max(Decimal(0), required_monthly_contribution)
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

    return {
        "required_monthly_contribution": round(required_monthly_contribution, 2),
        "projected_from_current_savings_alone": round(projected_from_current, 2),
        "already_on_track": remaining_need <= 0,
        "schedule": schedule,
    }
