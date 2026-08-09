"""Roth IRA growth calculator: after-tax contributions, tax-free growth/withdrawal, compared
side-by-side against an equivalent taxable brokerage account (same contributions, but each
year's investment GAINS are taxed at the household's marginal rate — a simplified but standard
way to show the Roth's tax-free-growth advantage). ANNUAL_LIMIT is a documented, simplified
constant (the real IRS limit changes yearly and is shared across Roth+Traditional IRA
contributions in combination — not modeled here)."""

from decimal import Decimal

ANNUAL_LIMIT = Decimal("7000")


def compute(
    current_age: int,
    retirement_age: int,
    current_balance: Decimal = Decimal(0),
    maximize_contributions: bool = True,
    annual_contribution: Decimal = Decimal("7000"),
    avg_return: Decimal = Decimal("0.07"),
    marginal_tax_rate: Decimal = Decimal("0.22"),
) -> dict:
    years = retirement_age - current_age
    if years <= 0:
        return {"error": "Retirement age must be after current age."}

    contribution = ANNUAL_LIMIT if maximize_contributions else min(annual_contribution, ANNUAL_LIMIT)

    roth_balance = current_balance
    taxable_balance = current_balance
    total_contributions = Decimal(0)
    schedule = []

    for year in range(1, years + 1):
        roth_balance = roth_balance * (1 + avg_return) + contribution

        taxable_balance += contribution
        gain = taxable_balance * avg_return
        after_tax_gain = gain * (1 - marginal_tax_rate)
        taxable_balance += after_tax_gain

        total_contributions += contribution
        schedule.append(
            {
                "year": year,
                "roth_balance": round(roth_balance, 2),
                "taxable_balance": round(taxable_balance, 2),
            }
        )

    return {
        "roth_balance": round(roth_balance, 2),
        "taxable_balance": round(taxable_balance, 2),
        "roth_advantage": round(roth_balance - taxable_balance, 2),
        "total_contributions": round(total_contributions, 2),
        "schedule": schedule,
        "contribution_capped": (not maximize_contributions) and annual_contribution > ANNUAL_LIMIT,
        "annual_limit": ANNUAL_LIMIT,
    }
