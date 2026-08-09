"""Solves for the annual interest rate implied by a principal, a target monthly payment,
and a term — the inverse of the standard amortization payment formula, via binary search
(closed-form inversion of the annuity formula isn't practical, and 60 iterations converges
to well beyond the precision this calculator needs). Term accepts years + months (per the
spec's "Loan Term (Years / Months)") rather than whole years only — the payment formula is
computed here directly for an arbitrary period count instead of routing through
mortgage.monthly_payment, which only accepts whole years."""

from decimal import ROUND_HALF_UP, Decimal


def _payment_at_rate(principal: Decimal, annual_rate: Decimal, n: int) -> Decimal:
    if annual_rate == 0:
        return (principal / n).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    r = annual_rate / 12
    payment = principal * r * (1 + r) ** n / ((1 + r) ** n - 1)
    return payment.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def compute(principal: Decimal, target_monthly_payment: Decimal, term_years: int, term_months: int = 0) -> dict:
    n = term_years * 12 + term_months
    if n <= 0:
        return {"annual_rate_pct": None, "total_paid": None, "total_interest": None, "error": "Loan term must be greater than zero."}

    min_payment = principal / n  # payment at a 0% rate — the floor
    if target_monthly_payment <= min_payment:
        return {
            "annual_rate_pct": None,
            "total_paid": None,
            "total_interest": None,
            "error": "That payment is at or below what a 0% loan would require — no positive rate solves this.",
        }

    lo, hi = Decimal("0"), Decimal("0.60")
    for _ in range(60):
        mid = (lo + hi) / 2
        payment = _payment_at_rate(principal, mid, n) if mid > 0 else min_payment
        if payment > target_monthly_payment:
            hi = mid
        else:
            lo = mid
    rate = (lo + hi) / 2

    total_paid = target_monthly_payment * n
    return {
        "annual_rate_pct": round(float(rate) * 100, 3),
        "total_paid": round(total_paid, 2),
        "total_interest": round(total_paid - principal, 2),
        "error": None,
    }
