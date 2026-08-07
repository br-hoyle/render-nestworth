"""Frequency-aware annuity math shared by the Loan, Payment, and Repayment calculators —
handles a loan whose stated compounding frequency differs from how often payments are made
(e.g. "compounded monthly, paid biweekly"), which mortgage.py's monthly-only formula never
needed to. Kept separate from mortgage.py rather than generalizing it in place, since
mortgage.py backs the Housing & Mortgage calculators and several others (amortization,
debt-consolidation) that have no reason to change here."""

from decimal import Decimal

from app.services.calculators._frequency import PERIODS_PER_YEAR


def effective_period_rate(annual_rate: Decimal, compound_frequency: str, payback_frequency: str) -> Decimal:
    """The rate to apply once per payback period, derived from a nominal annual rate stated at
    a (possibly different) compounding frequency — via the same effective-annual-rate bridge
    compound_interest_converter.py uses to convert between frequencies."""
    compound_n = PERIODS_PER_YEAR[compound_frequency]
    payback_n = PERIODS_PER_YEAR[payback_frequency]
    if compound_n == payback_n:
        return annual_rate / payback_n
    effective_annual = (1 + annual_rate / compound_n) ** compound_n - 1
    return (1 + effective_annual) ** (Decimal(1) / payback_n) - 1


def annuity_payment(principal: Decimal, period_rate: Decimal, n: int) -> Decimal:
    """Standard level-payment formula — the same shape as mortgage.monthly_payment, but for an
    arbitrary period rate/count instead of assuming monthly."""
    if n <= 0:
        return Decimal(0)
    if period_rate == 0:
        return principal / n
    growth = (1 + period_rate) ** n
    return principal * period_rate * growth / (growth - 1)


def periods_for_payment(principal: Decimal, period_rate: Decimal, payment: Decimal) -> Decimal | None:
    """Closed-form inversion (via Decimal's native .ln()) of the annuity formula, solving for
    the number of periods at a fixed payment. Returns None if the payment doesn't even cover
    the first period's interest — the balance would never shrink."""
    if payment <= 0:
        return None
    if period_rate == 0:
        return principal / payment
    if payment <= principal * period_rate:
        return None
    return -((1 - principal * period_rate / payment).ln()) / (1 + period_rate).ln()
