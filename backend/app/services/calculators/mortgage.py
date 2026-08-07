"""Mortgage Calculator — a home-price-and-down-payment framing of an amortized loan, plus the
full monthly cost of homeownership: principal & interest, property tax, home insurance, PMI,
HOA, and other recurring costs. Each escrow item may be entered as a flat annual dollar amount
or as a percentage of the home price per year (see _costs.resolve_annual), matching
calculator.net's "% or $" toggle on these fields.

PMI is applied whenever the down payment is under 20% of the home price — the standard trigger
for requiring it — but modeled as a flat recurring cost for the life of the loan rather than
auto-cancelling once paydown reaches 20% equity: the spec's PMI input is a flat rate/amount with
no cancellation rule specified, so this keeps the assumption simple and explicit rather than
adding unrequested behavior.

`monthly_payment` and `_add_months` are also imported directly by refinance.py and
debt_consolidation.py — kept at their original names/signatures for that reason."""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from app.services.calculators._amortization import amortize
from app.services.calculators._costs import resolve_annual

PMI_REQUIRED_BELOW_DOWN_PAYMENT_PCT = Decimal("0.20")


def monthly_payment(principal: Decimal, annual_rate: Decimal, term_years: int) -> Decimal:
    n = term_years * 12
    if annual_rate == 0:
        return (principal / n).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    r = annual_rate / 12
    payment = principal * r * (1 + r) ** n / ((1 + r) ** n - 1)
    return payment.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(d.day, 28))


def compute(
    home_price: Decimal,
    down_payment_value: Decimal,
    down_payment_is_percent: bool,
    annual_rate: Decimal,
    term_years: int,
    start_date: date,
    property_tax_value: Decimal = Decimal(0),
    property_tax_is_percent: bool = True,
    home_insurance_value: Decimal = Decimal(0),
    home_insurance_is_percent: bool = True,
    pmi_value: Decimal = Decimal(0),
    pmi_is_percent: bool = True,
    hoa_fees_value: Decimal = Decimal(0),
    hoa_fees_is_percent: bool = False,
    other_costs_value: Decimal = Decimal(0),
    other_costs_is_percent: bool = False,
) -> dict:
    if home_price <= 0:
        return {"error": "Home price must be greater than zero."}

    down_payment_amount = resolve_annual(down_payment_value, down_payment_is_percent, home_price)
    loan_amount = home_price - down_payment_amount
    if loan_amount <= 0:
        return {"error": "Down payment can't be greater than or equal to the home price."}

    payment = monthly_payment(loan_amount, annual_rate, term_years)
    result = amortize(loan_amount, annual_rate, payment, payments_per_year=12)
    months = result["periods_to_payoff"] or term_years * 12
    payoff_date = _add_months(start_date, months)

    annual_property_tax = resolve_annual(property_tax_value, property_tax_is_percent, home_price)
    annual_home_insurance = resolve_annual(home_insurance_value, home_insurance_is_percent, home_price)
    down_payment_pct = down_payment_amount / home_price
    annual_pmi = (
        resolve_annual(pmi_value, pmi_is_percent, home_price)
        if down_payment_pct < PMI_REQUIRED_BELOW_DOWN_PAYMENT_PCT
        else Decimal(0)
    )
    annual_hoa = resolve_annual(hoa_fees_value, hoa_fees_is_percent, home_price)
    annual_other = resolve_annual(other_costs_value, other_costs_is_percent, home_price)

    monthly_escrow = {
        "property_tax": round(annual_property_tax / 12, 2),
        "home_insurance": round(annual_home_insurance / 12, 2),
        "pmi": round(annual_pmi / 12, 2),
        "hoa_fees": round(annual_hoa / 12, 2),
        "other_costs": round(annual_other / 12, 2),
    }
    total_monthly_escrow = sum(monthly_escrow.values(), Decimal(0))

    return {
        "loan_amount": round(loan_amount, 2),
        "down_payment_amount": round(down_payment_amount, 2),
        "monthly_pi": payment,
        "monthly_escrow": monthly_escrow,
        "total_monthly_payment": round(payment + total_monthly_escrow, 2),
        "payoff_date": payoff_date,
        "total_interest": result["total_interest"],
        "total_paid": round(loan_amount + result["total_interest"], 2),
        "yearly_schedule": result["yearly_schedule"],
    }
