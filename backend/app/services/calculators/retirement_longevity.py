""""How long can your money last?" — simulates a fixed monthly withdrawal against a starting
balance until it depletes, or confirms it lasts indefinitely (withdrawal below what the return
alone replenishes each month). A 1200-month (100-year) safety cap matches the iteration-cap
convention used elsewhere (mortgage.py, debt_payoff.py).

retirement_age and life_expectancy turn the raw months-lasted figure into an actual age, and let
this report a dollar shortfall/surplus at life expectancy specifically: balance_at_life_expectancy
is a closed-form projection (the standard future-value-with-level-withdrawals formula) that's
allowed to go negative past depletion — a "shadow" balance showing how far underwater a household
would be if forced to keep withdrawing after running out, rather than clamping at zero the way the
real month-by-month schedule below does."""

from decimal import Decimal

MAX_MONTHS = 1200


def _projected_balance(balance: Decimal, monthly_rate: Decimal, withdrawal: Decimal, months: int) -> Decimal:
    """Future value after `months` of a fixed monthly withdrawal — allowed to go negative,
    unlike the real simulation below, so a shortfall at a specific age can be quantified."""
    if months <= 0:
        return balance
    if monthly_rate == 0:
        return balance - withdrawal * months
    growth = (1 + monthly_rate) ** months
    return balance * growth - withdrawal * (growth - 1) / monthly_rate


def compute(
    retirement_savings_at_retirement: Decimal,
    planned_withdrawal_amount: Decimal,
    avg_investment_return: Decimal = Decimal("0.06"),
    retirement_age: int = 65,
    life_expectancy: int = 90,
) -> dict:
    monthly_rate = avg_investment_return / 12
    months_to_life_expectancy = max(0, (life_expectancy - retirement_age) * 12)
    balance_at_life_expectancy = _projected_balance(
        retirement_savings_at_retirement, monthly_rate, planned_withdrawal_amount, months_to_life_expectancy
    )

    if planned_withdrawal_amount <= retirement_savings_at_retirement * monthly_rate:
        # Withdrawing less than the balance earns each month — it never runs out on its own.
        # Simulate real growth (not a flat repeat) out past life expectancy so the chart shows
        # an actual rising balance instead of a placeholder flat line.
        horizon_years = max(30, life_expectancy - retirement_age + 10)
        schedule = []
        balance = retirement_savings_at_retirement
        for year in range(1, horizon_years + 1):
            for _ in range(12):
                balance = balance * (1 + monthly_rate) - planned_withdrawal_amount
            schedule.append({"age": retirement_age + year, "balance": round(balance, 2)})
        return {
            "months_lasted": None,
            "years_lasted": None,
            "depletion_age": None,
            "lasts_indefinitely": True,
            "balance_at_life_expectancy": round(balance_at_life_expectancy, 2),
            "years_before_after_life_expectancy": None,
            "schedule": schedule,
        }

    balance = retirement_savings_at_retirement
    schedule = []
    months = 0
    while balance > 0 and months < MAX_MONTHS:
        months += 1
        balance = balance * (1 + monthly_rate) - planned_withdrawal_amount
        if balance <= 0:
            balance = Decimal(0)
        if months % 12 == 0 or balance <= 0:
            schedule.append({"age": retirement_age + (months - 1) // 12 + 1, "balance": round(balance, 2)})

    lasts_indefinitely = months >= MAX_MONTHS
    years_lasted = None if lasts_indefinitely else round(Decimal(months) / 12, 1)
    depletion_age = None if lasts_indefinitely else retirement_age + round(months / 12)
    years_before_after_life_expectancy = None if depletion_age is None else depletion_age - life_expectancy

    return {
        "months_lasted": None if lasts_indefinitely else months,
        "years_lasted": years_lasted,
        "depletion_age": depletion_age,
        "lasts_indefinitely": lasts_indefinitely,
        "balance_at_life_expectancy": round(balance_at_life_expectancy, 2),
        "years_before_after_life_expectancy": years_before_after_life_expectancy,
        "schedule": schedule,
    }
