"""Solves for the monthly contribution required to reach a target emergency-fund size by a
given number of months from now — complements the existing Emergency Fund calculator, which
answers "how many months am I covered for right now" rather than "how do I get to my goal"."""

from decimal import Decimal


def compute(
    current_liquid_balance: Decimal,
    monthly_expense: Decimal,
    target_months: Decimal,
    months_to_reach_goal: int,
) -> dict:
    target_amount = monthly_expense * target_months
    shortfall = target_amount - current_liquid_balance

    if shortfall <= 0:
        return {
            "target_amount": round(target_amount, 2),
            "shortfall": Decimal(0),
            "required_monthly_contribution": Decimal(0),
            "already_met": True,
        }

    required = shortfall / months_to_reach_goal if months_to_reach_goal > 0 else None
    return {
        "target_amount": round(target_amount, 2),
        "shortfall": round(shortfall, 2),
        "required_monthly_contribution": round(required, 2) if required is not None else None,
        "already_met": False,
    }
