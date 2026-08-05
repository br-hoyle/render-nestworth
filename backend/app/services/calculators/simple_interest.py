from decimal import Decimal


def compute(principal: Decimal, annual_rate: Decimal, years: Decimal) -> dict:
    interest = principal * annual_rate * years
    return {
        "interest": round(interest, 2),
        "total": round(principal + interest, 2),
    }
