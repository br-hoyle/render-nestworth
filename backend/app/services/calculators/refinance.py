"""Refinance Calculator — compares an existing loan against a refinance offer. Unlike the
original version, the current loan's remaining term isn't asked for directly (households
rarely know that number precisely) — instead it's derived from the balance, rate, and current
monthly payment already on a statement, via _annuity.periods_for_payment (the same closed-form
inversion the Repayment Calculator uses).

New Loan Points (a percentage of the new loan amount, paid upfront to secure the quoted rate)
and New Loan Costs & Fees (a flat dollar amount) are both one-time costs folded into a single
upfront-cost figure for the breakeven calculation. A Cash Out Amount is added directly to the
new loan's principal and nets against the upfront cost, since receiving cash offsets what
refinancing costs."""

from decimal import ROUND_CEILING, Decimal

from app.services.calculators._annuity import periods_for_payment
from app.services.calculators.mortgage import monthly_payment


def compute(
    current_balance: Decimal,
    current_monthly_payment: Decimal,
    current_rate: Decimal,
    new_rate: Decimal,
    new_term_years: int = 30,
    new_loan_points: Decimal = Decimal(0),
    new_loan_costs_fees: Decimal = Decimal(0),
    cash_out_amount: Decimal = Decimal(0),
) -> dict:
    current_remaining_months = periods_for_payment(current_balance, current_rate / 12, current_monthly_payment)
    if current_remaining_months is None:
        return {"error": "That monthly payment doesn't cover the interest on the current balance — this loan would never be paid off as entered."}
    current_remaining_months = int(current_remaining_months.to_integral_value(rounding=ROUND_CEILING))

    new_loan_amount = current_balance + cash_out_amount
    new_payment = monthly_payment(new_loan_amount, new_rate, new_term_years)
    monthly_savings = current_monthly_payment - new_payment

    upfront_costs = round(new_loan_amount * new_loan_points + new_loan_costs_fees, 2)
    net_upfront_cost = round(upfront_costs - cash_out_amount, 2)

    breakeven_months = None
    if monthly_savings > 0:
        breakeven_months = int((upfront_costs / monthly_savings).to_integral_value(rounding=ROUND_CEILING)) if upfront_costs > 0 else 0

    current_total_interest_remaining = round(
        current_monthly_payment * current_remaining_months - current_balance, 2
    )
    new_total_interest = round(new_payment * new_term_years * 12 - new_loan_amount, 2)

    return {
        "current_remaining_months": current_remaining_months,
        "current_remaining_years": round(Decimal(current_remaining_months) / 12, 2),
        "new_loan_amount": round(new_loan_amount, 2),
        "new_payment": new_payment,
        "monthly_savings": round(monthly_savings, 2),
        "upfront_costs": upfront_costs,
        "net_upfront_cost": net_upfront_cost,
        "breakeven_months": breakeven_months,
        "current_total_interest_remaining": current_total_interest_remaining,
        "new_total_interest": new_total_interest,
        "lifetime_interest_saved": round(current_total_interest_remaining - new_total_interest, 2),
    }
