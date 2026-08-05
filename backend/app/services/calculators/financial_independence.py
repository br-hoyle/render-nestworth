"""Years-to-FI from current net worth, savings rate, and expected return — distinct from the
existing Retirement calculator's age-based drawdown projection. FI number = annual expenses
÷ withdrawal rate (the standard "25x expenses" rule at a 4% withdrawal rate)."""

from decimal import Decimal


def compute(
    current_net_worth: Decimal,
    annual_savings: Decimal,
    annual_expenses: Decimal,
    expected_return: Decimal = Decimal("0.07"),
    withdrawal_rate: Decimal = Decimal("0.04"),
) -> dict:
    fi_number = annual_expenses / withdrawal_rate if withdrawal_rate > 0 else Decimal(0)

    if current_net_worth >= fi_number:
        return {
            "fi_number": round(fi_number, 2),
            "years_to_fi": 0,
            "schedule": [],
            "already_fi": True,
        }

    balance = current_net_worth
    schedule = []
    year = 0
    while balance < fi_number and year < 100:
        year += 1
        balance = balance * (1 + expected_return) + annual_savings
        schedule.append({"year": year, "balance": round(balance, 2)})

    return {
        "fi_number": round(fi_number, 2),
        "years_to_fi": year if balance >= fi_number else None,
        "schedule": schedule,
        "already_fi": False,
    }
