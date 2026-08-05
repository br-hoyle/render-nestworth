from decimal import Decimal


def compute(
    current_age: int,
    retirement_age: int,
    life_expectancy: int,
    current_balance: Decimal,
    monthly_contribution: Decimal,
    real_return_rate: Decimal,
    withdrawal_rate: Decimal,
    social_security_monthly: Decimal = Decimal(0),
) -> dict:
    balance = current_balance
    schedule = []

    for age in range(current_age, retirement_age):
        balance = balance * (1 + real_return_rate) + monthly_contribution * 12
        schedule.append({"age": age + 1, "balance": round(balance, 2), "phase": "accumulation"})

    balance_at_retirement = balance
    annual_withdrawal = balance_at_retirement * withdrawal_rate
    annual_social_security = social_security_monthly * 12
    depletion_age = None

    for age in range(retirement_age, life_expectancy + 1):
        net_draw = annual_withdrawal - annual_social_security
        balance = balance * (1 + real_return_rate) - net_draw
        if balance <= 0:
            balance = Decimal(0)
            depletion_age = age + 1
            schedule.append({"age": age + 1, "balance": 0.0, "phase": "drawdown"})
            break
        schedule.append({"age": age + 1, "balance": round(balance, 2), "phase": "drawdown"})

    return {
        "schedule": schedule,
        "balance_at_retirement": round(balance_at_retirement, 2),
        "depletion_age": depletion_age,
        "lasts_past_life_expectancy": depletion_age is None,
    }
