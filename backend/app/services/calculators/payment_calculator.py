"""Payment Calculator — solve for one of two unknowns on a fixed-rate loan:
Fixed Term: given amount + term + rate, find the monthly payment.
Fixed Payments: given amount + payment + rate, find how long it takes to pay off.
Monthly-only (unlike Loan/Repayment calculators) — matches the spec's simpler input set for
this tool."""

from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from app.services.calculators._annuity import annuity_payment, periods_for_payment


def compute(
    principal: Decimal,
    annual_rate: Decimal,
    mode: str,
    term_years: int | None = None,
    monthly_payment: Decimal | None = None,
) -> dict:
    r = annual_rate / 12

    if mode == "fixed_term":
        if term_years is None:
            return {"error": "A loan term is required to solve for a payment."}
        payment = annuity_payment(principal, r, term_years * 12).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total_paid = payment * term_years * 12
        return {
            "monthly_payment": payment,
            "total_paid": round(total_paid, 2),
            "total_interest": round(total_paid - principal, 2),
        }

    if mode == "fixed_payments":
        if monthly_payment is None:
            return {"error": "A monthly payment is required to solve for payoff time."}
        n = periods_for_payment(principal, r, monthly_payment)
        if n is None:
            return {
                "error": "That payment doesn't cover the interest — this loan would never be paid off.",
                "months_to_payoff": None,
            }
        months = int(n.to_integral_value(rounding=ROUND_CEILING))
        total_paid = monthly_payment * months
        return {
            "months_to_payoff": months,
            "years_to_payoff": round(Decimal(months) / 12, 2),
            "total_paid": round(total_paid, 2),
            "total_interest": round(total_paid - principal, 2),
        }

    return {"error": f"Unknown mode: {mode}"}
