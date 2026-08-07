"""Rent vs Buy Calculator — the most involved calculator in the Housing & Mortgage section:
simulates home ownership and renting side-by-side over a chosen comparison horizon and reports
which one leaves the household better off in future-value terms.

Method ("invest the difference"): each year, whichever option costs less that year is assumed
to have its savings invested at the given average investment return; the running, compounded
gap between the two options' costs is the final answer — if positive, renting-and-investing
the difference wins by that amount (in future dollars at the end of the horizon); if negative,
buying wins by that amount. This is the standard economic framing for a rent-vs-buy comparison
(not simply "which has the lower monthly payment"), since it accounts for the down payment's
opportunity cost, the mortgage's amortization, home price appreciation, and every recurring
cost on both sides.

Buy-side costs: P&I (via _amortization.amortize, stopping once the loan is paid off — if that
happens before the comparison horizon ends, only escrow costs continue for the remaining years),
property tax (its own annual increase rate, independent of home appreciation — a mill-rate-style
escalation rather than tied to the home's assessed value), and home insurance/HOA/maintenance
(a shared "costs increase" rate, per the spec's single "Costs / Insurance Increase" input).
Closing costs are a one-time, upfront % of home price; selling closing costs are a one-time %
of the home's appreciated value, charged only at the end of the horizon when computing sale
proceeds.

Tax treatment: assumes the household itemizes only when mortgage interest + property tax paid
that year exceeds the standard deduction for their filing status (STANDARD_DEDUCTION below —
approximate, single-tax-year constants, the same "documented simplified constant" convention as
Roth IRA's ANNUAL_LIMIT) — only the excess over the standard deduction gets a tax benefit, at
the combined federal+state marginal rate. Other itemizable items (state income tax paid,
charitable giving, etc.) aren't modeled. Renters insurance and the rent-side upfront/security
deposit costs are not tax-advantaged in any way, matching how renting is actually taxed.

Simplifications flagged for the record: no SALT deduction cap, no AMT, security deposit assumed
fully refunded at the end of the horizon, renters insurance held flat (no separate increase
rate — the spec gives one for buy-side insurance but not rent-side)."""

from decimal import Decimal

from app.services.calculators._amortization import amortize
from app.services.calculators._costs import resolve_annual
from app.services.calculators.mortgage import monthly_payment

STANDARD_DEDUCTION = {
    "single": Decimal(14600),
    "married_filing_jointly": Decimal(29200),
    "head_of_household": Decimal(21900),
}


def compute(
    comparison_years: int,
    home_price: Decimal,
    down_payment_value: Decimal,
    down_payment_is_percent: bool,
    annual_rate: Decimal,
    loan_term_years: int,
    closing_costs_pct: Decimal,
    property_tax_pct: Decimal,
    property_tax_increase_pct: Decimal,
    home_insurance_pct: Decimal,
    hoa_fees_pct: Decimal,
    maintenance_pct: Decimal,
    home_appreciation_pct: Decimal,
    costs_increase_pct: Decimal,
    selling_closing_costs_pct: Decimal,
    monthly_rent: Decimal,
    rental_increase_pct: Decimal,
    renters_insurance_annual: Decimal,
    security_deposit: Decimal,
    rent_upfront_cost: Decimal,
    avg_investment_return: Decimal,
    marginal_federal_rate: Decimal,
    marginal_state_rate: Decimal,
    tax_filing_status: str = "single",
) -> dict:
    down_payment_amount = resolve_annual(down_payment_value, down_payment_is_percent, home_price)
    loan_amount = home_price - down_payment_amount
    if loan_amount <= 0:
        return {"error": "Down payment can't be greater than or equal to the home price."}

    payment = monthly_payment(loan_amount, annual_rate, loan_term_years)
    monthly_periods = amortize(loan_amount, annual_rate, payment, payments_per_year=12)["periods"]

    closing_costs_amount = home_price * closing_costs_pct
    combined_tax_rate = marginal_federal_rate + marginal_state_rate
    standard_deduction = STANDARD_DEDUCTION.get(tax_filing_status, STANDARD_DEDUCTION["single"])

    schedule = []
    loan_balance = loan_amount
    investment_balance = (down_payment_amount + closing_costs_amount) - (security_deposit + rent_upfront_cost)

    for year in range(1, comparison_years + 1):
        start = (year - 1) * 12
        end = min(year * 12, len(monthly_periods))
        year_periods = monthly_periods[start:end]
        year_pi_payment = sum((p["principal"] + p["interest"] for p in year_periods), Decimal(0))
        year_interest = sum((p["interest"] for p in year_periods), Decimal(0))
        loan_balance = year_periods[-1]["balance"] if year_periods else Decimal(0)

        home_value = home_price * (1 + home_appreciation_pct) ** year
        property_tax = home_price * property_tax_pct * (1 + property_tax_increase_pct) ** (year - 1)
        home_insurance = home_price * home_insurance_pct * (1 + costs_increase_pct) ** (year - 1)
        hoa = home_price * hoa_fees_pct * (1 + costs_increase_pct) ** (year - 1)
        maintenance = home_price * maintenance_pct * (1 + costs_increase_pct) ** (year - 1)

        itemized = year_interest + property_tax
        tax_shield = max(Decimal(0), itemized - standard_deduction) * combined_tax_rate
        buy_cost = year_pi_payment + property_tax + home_insurance + hoa + maintenance - tax_shield

        annual_rent = monthly_rent * 12 * (1 + rental_increase_pct) ** (year - 1)
        rent_cost = annual_rent + renters_insurance_annual

        if year == comparison_years:
            sale_proceeds = home_value * (1 - selling_closing_costs_pct) - loan_balance
            buy_cost -= sale_proceeds
            rent_cost -= security_deposit  # assumed fully refunded at the end of the horizon

        investment_balance = investment_balance * (1 + avg_investment_return) + (buy_cost - rent_cost)

        schedule.append(
            {
                "year": year,
                "home_value": round(home_value, 2),
                "loan_balance": round(loan_balance, 2),
                "home_equity": round(home_value - loan_balance, 2),
                "advantage_of_renting": round(investment_balance, 2),
            }
        )

    final = schedule[-1]
    breakeven_year = None
    first_sign_positive = schedule[0]["advantage_of_renting"] >= 0
    for point in schedule[1:]:
        if (point["advantage_of_renting"] >= 0) != first_sign_positive:
            breakeven_year = point["year"]
            break

    return {
        "advantage_of_renting": final["advantage_of_renting"],
        "recommendation": "Renting" if final["advantage_of_renting"] > 0 else "Buying",
        "home_equity_at_horizon": final["home_equity"],
        "home_value_at_horizon": final["home_value"],
        "breakeven_year": breakeven_year,
        "schedule": schedule,
    }
