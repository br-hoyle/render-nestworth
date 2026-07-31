from decimal import ROUND_CEILING, Decimal

from app.services.calculators.mortgage import monthly_payment


def compute(
    current_balance: Decimal,
    current_rate: Decimal,
    current_remaining_years: int,
    new_rate: Decimal,
    new_term_years: int,
    closing_costs: Decimal = Decimal(0),
) -> dict:
    current_payment = monthly_payment(current_balance, current_rate, current_remaining_years)
    new_payment = monthly_payment(current_balance, new_rate, new_term_years)
    monthly_savings = current_payment - new_payment

    breakeven_months = None
    if monthly_savings > 0 and closing_costs > 0:
        breakeven_months = int((closing_costs / monthly_savings).to_integral_value(rounding=ROUND_CEILING))
    elif monthly_savings > 0:
        breakeven_months = 0

    current_total_interest = current_payment * (current_remaining_years * 12) - current_balance
    new_total_interest = new_payment * (new_term_years * 12) - current_balance

    return {
        "current_payment": current_payment,
        "new_payment": new_payment,
        "monthly_savings": round(monthly_savings, 2),
        "breakeven_months": breakeven_months,
        "lifetime_interest_saved": round(current_total_interest - new_total_interest, 2),
    }
