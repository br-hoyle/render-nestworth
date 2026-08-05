"""Roth IRA growth calculator: after-tax contributions, tax-free growth/withdrawal framing.
ANNUAL_LIMIT is a documented, simplified constant (the real IRS limit changes yearly and is
shared across Roth+Traditional IRA contributions in combination — not modeled here)."""

from decimal import Decimal

ANNUAL_LIMIT = Decimal("7000")


def compute(
    current_balance: Decimal,
    annual_contribution: Decimal,
    years: int,
    annual_rate: Decimal = Decimal("0.07"),
) -> dict:
    contribution = min(annual_contribution, ANNUAL_LIMIT)
    balance = current_balance
    total_contributions = Decimal(0)
    schedule = []
    for year in range(1, years + 1):
        balance = balance * (1 + annual_rate) + contribution
        total_contributions += contribution
        schedule.append({"year": year, "balance": round(balance, 2)})

    return {
        "final_balance": round(balance, 2),
        "total_contributions": round(total_contributions, 2),
        "total_growth": round(balance - current_balance - total_contributions, 2),
        "schedule": schedule,
        "contribution_capped": annual_contribution > ANNUAL_LIMIT,
        "annual_limit": ANNUAL_LIMIT,
    }
