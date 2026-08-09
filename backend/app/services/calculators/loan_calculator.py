"""Loan Calculator — three ways to frame paying back (or being owed) a fixed sum, matching
calculator.net's tab layout:
- Amortized: pay down the amount with periodic payments — a standard loan.
- Deferred: nothing is paid until maturity, when the entire accrued amount is due at once.
- Bond: the mirror image of Deferred — a known amount is due at maturity, and this solves
  for what that's worth today (its present value).
Compound frequency (and, for Amortized, payback frequency too) are independently
configurable — see _annuity.py's effective_period_rate for how a mismatch between the two is
handled. The `principal` field means the amount borrowed for Amortized/Deferred, but the
predetermined amount due at maturity for Bond — kept as one field name across all three modes
(mirroring investment.py's shared-field-different-meaning approach) rather than three schemas."""

from decimal import ROUND_HALF_UP, Decimal

from app.services.calculators._annuity import annuity_payment, effective_period_rate
from app.services.calculators._frequency import PERIODS_PER_YEAR


def _compute_amortized(
    principal: Decimal, annual_rate: Decimal, term_years: int, compound_frequency: str, payback_frequency: str
) -> dict:
    payback_n = PERIODS_PER_YEAR[payback_frequency]
    r = effective_period_rate(annual_rate, compound_frequency, payback_frequency)
    n = term_years * payback_n
    payment = annuity_payment(principal, r, n).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    balance = principal
    total_interest = Decimal(0)
    yearly_schedule = []
    year_principal = Decimal(0)
    year_interest = Decimal(0)
    period = 0
    periods_this_year = 0

    while balance > 0 and period < n * 2:  # safety cap, matches mortgage.py's convention
        period += 1
        interest = (balance * r).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        principal_payment = payment - interest
        if principal_payment >= balance:
            principal_payment = balance
        balance -= principal_payment
        total_interest += interest
        year_principal += principal_payment
        year_interest += interest
        periods_this_year += 1

        if periods_this_year == payback_n or balance <= 0:
            yearly_schedule.append(
                {
                    "year": len(yearly_schedule) + 1,
                    "principal": round(year_principal, 2),
                    "interest": round(year_interest, 2),
                    "balance": round(balance, 2),
                }
            )
            year_principal = Decimal(0)
            year_interest = Decimal(0)
            periods_this_year = 0

    return {
        "payment_per_period": payment,
        "total_interest": round(total_interest, 2),
        "total_paid": round(principal + total_interest, 2),
        "yearly_schedule": yearly_schedule,
    }


def _compute_deferred(principal: Decimal, annual_rate: Decimal, term_years: int, compound_frequency: str) -> dict:
    n = PERIODS_PER_YEAR[compound_frequency]
    total_periods = term_years * n
    rate_per_period = annual_rate / n
    amount_due = principal * (1 + rate_per_period) ** total_periods
    return {
        "amount_due_at_maturity": round(amount_due, 2),
        "total_interest": round(amount_due - principal, 2),
    }


def _compute_bond(face_value: Decimal, annual_rate: Decimal, term_years: int, compound_frequency: str) -> dict:
    n = PERIODS_PER_YEAR[compound_frequency]
    total_periods = term_years * n
    rate_per_period = annual_rate / n
    initial_value = face_value / (1 + rate_per_period) ** total_periods
    return {
        "initial_value": round(initial_value, 2),
        "total_interest": round(face_value - initial_value, 2),
    }


def compute(
    loan_type: str,
    principal: Decimal,
    annual_rate: Decimal,
    term_years: int,
    compound_frequency: str = "monthly",
    payback_frequency: str = "monthly",
) -> dict:
    if compound_frequency not in PERIODS_PER_YEAR:
        return {"error": f"Unknown compound frequency: {compound_frequency}"}

    if loan_type == "amortized":
        if payback_frequency not in PERIODS_PER_YEAR:
            return {"error": f"Unknown payback frequency: {payback_frequency}"}
        return _compute_amortized(principal, annual_rate, term_years, compound_frequency, payback_frequency)
    if loan_type == "deferred":
        return _compute_deferred(principal, annual_rate, term_years, compound_frequency)
    if loan_type == "bond":
        return _compute_bond(principal, annual_rate, term_years, compound_frequency)
    return {"error": f"Unknown loan type: {loan_type}"}
