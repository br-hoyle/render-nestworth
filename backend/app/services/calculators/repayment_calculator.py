"""Repayment Calculator — like Payment Calculator, but framed for an ongoing debt rather than
a fresh loan: its own compounding frequency and payback frequency (not necessarily monthly),
matching calculator.net's more general "balance + periods" framing. Solves for either the
payment on a fixed timeline (Fixed Time) or the time to pay off a fixed installment (Fixed
Installment)."""

from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from app.services.calculators._annuity import annuity_payment, effective_period_rate, periods_for_payment
from app.services.calculators._frequency import PERIODS_PER_YEAR


def compute(
    balance: Decimal,
    annual_rate: Decimal,
    mode: str,
    compound_frequency: str = "monthly",
    payback_frequency: str = "monthly",
    term_years: int | None = None,
    term_months: int = 0,
    installment_amount: Decimal | None = None,
) -> dict:
    if compound_frequency not in PERIODS_PER_YEAR:
        return {"error": f"Unknown compound frequency: {compound_frequency}"}
    if payback_frequency not in PERIODS_PER_YEAR:
        return {"error": f"Unknown payback frequency: {payback_frequency}"}

    payback_n = PERIODS_PER_YEAR[payback_frequency]
    r = effective_period_rate(annual_rate, compound_frequency, payback_frequency)

    if mode == "fixed_time":
        if term_years is None:
            return {"error": "A repayment time is required."}
        n = term_years * payback_n + round(term_months * payback_n / 12)
        if n <= 0:
            return {"error": "Repayment time must be greater than zero."}
        payment = annuity_payment(balance, r, n).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total_paid = payment * n
        return {
            "payment_per_period": payment,
            "total_paid": round(total_paid, 2),
            "total_interest": round(total_paid - balance, 2),
        }

    if mode == "fixed_installment":
        if installment_amount is None:
            return {"error": "An installment amount is required."}
        n = periods_for_payment(balance, r, installment_amount)
        if n is None:
            return {
                "error": "That installment doesn't cover the interest — this debt would never be paid off.",
                "periods_to_payoff": None,
            }
        periods = int(n.to_integral_value(rounding=ROUND_CEILING))
        total_paid = installment_amount * periods
        return {
            "periods_to_payoff": periods,
            "years_to_payoff": round(Decimal(periods) / payback_n, 2),
            "total_paid": round(total_paid, 2),
            "total_interest": round(total_paid - balance, 2),
        }

    return {"error": f"Unknown mode: {mode}"}
