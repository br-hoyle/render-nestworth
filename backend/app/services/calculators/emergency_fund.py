from decimal import Decimal


def compute(liquid_balance: Decimal, monthly_expense: Decimal, target_months: Decimal) -> dict:
    if monthly_expense <= 0:
        return {"months_covered": None, "target_amount": None, "shortfall": None}

    months_covered = liquid_balance / monthly_expense
    target_amount = monthly_expense * target_months
    shortfall = max(Decimal(0), target_amount - liquid_balance)

    return {
        "months_covered": round(months_covered, 2),
        "target_amount": round(target_amount, 2),
        "shortfall": round(shortfall, 2),
    }
