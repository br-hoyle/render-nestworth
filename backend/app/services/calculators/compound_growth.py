from decimal import Decimal


def compute(
    principal: Decimal,
    monthly_contribution: Decimal,
    annual_rate: Decimal,
    years: int,
) -> dict:
    monthly_rate = annual_rate / 12
    balance = principal
    total_contributions = principal
    schedule = []

    for month in range(1, years * 12 + 1):
        balance = balance * (1 + monthly_rate) + monthly_contribution
        total_contributions += monthly_contribution
        if month % 12 == 0:
            schedule.append({"year": month // 12, "balance": round(balance, 2)})

    return {
        "schedule": schedule,
        "final_balance": round(balance, 2),
        "total_contributions": round(total_contributions, 2),
        "total_growth": round(balance - total_contributions, 2),
    }
