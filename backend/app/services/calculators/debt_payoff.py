from decimal import Decimal, ROUND_HALF_UP


def compute(balance: Decimal, annual_rate: Decimal, monthly_payment: Decimal) -> dict:
    r = annual_rate / 12
    first_interest = (balance * r).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if monthly_payment <= first_interest:
        return {
            "payoff_months": None,
            "total_interest": None,
            "schedule": [],
            "error": "This payment never covers the interest — the balance will never shrink.",
        }

    remaining = balance
    total_interest = Decimal(0)
    schedule = []
    month = 0
    while remaining > 0 and month < 1200:  # 100-year safety cap
        month += 1
        interest = (remaining * r).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        principal_payment = monthly_payment - interest
        if principal_payment >= remaining:
            principal_payment = remaining
        remaining -= principal_payment
        total_interest += interest
        if month % 12 == 0 or remaining <= 0:
            schedule.append({"month": month, "balance": round(remaining, 2)})

    return {
        "payoff_months": month,
        "total_interest": round(total_interest, 2),
        "schedule": schedule,
        "error": None,
    }
