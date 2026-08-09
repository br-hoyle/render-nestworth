"""Rent vs Buy Calculator — the most involved calculator in the Housing & Mortgage section:
simulates home ownership and renting side-by-side and, for every possible length of stay from
1 year up to the comparison horizon, reports the **average monthly cost** of each option if you
sold (or stopped renting) at that point — the same "average cost by staying length" framing
calculator.net's version uses, which is what makes a clean break-even statement possible
("buying is cheaper if you stay N years or longer") instead of only a single end-of-horizon
number.

Method, per staying length N (years):

- `buy_net_cost(N)` = every dollar paid out on the buy side through year N (down payment,
  closing costs, P&I, property tax, home insurance, PMI, HOA, other costs, minus the mortgage-
  interest tax shield) **minus** what you'd get back by selling at that point — home value
  (appreciated N years) net of selling closing costs, minus the remaining loan balance. This is
  the piece that was previously missing: without netting out the sale proceeds, buying could
  never look cheaper long-term even though paying down a mortgage builds equity a renter never
  gets back. Early years are dominated by the down payment and closing costs (a big lump paid
  once, averaged over very few years); later years are dominated by ordinary recurring costs
  growing against a housing market that's (usually) appreciating faster than those costs, plus
  loan-balance paydown — the combination is what produces the "cheap-then-rising" curve on the
  buy side and mirrors the shape calculator.net's own chart shows.
- `rent_net_cost(N)` = every dollar paid on the rent side through year N (rent, renters
  insurance, upfront cost) **minus** the investment growth (not the principal — that's already
  reflected in the two sides' raw cash outlay difference) earned on whichever side had more cash
  free to invest upfront (typically the renter, since buying ties up a down payment renting
  doesn't require) at the household's average investment return. This is the standard "invest
  the difference" opportunity-cost treatment, just applied per staying-length instead of once at
  the end of a fixed horizon.
- `avg_monthly_cost(N) = net_cost(N) / (12 × N)` for both sides. The chart plots these two curves
  across every N from 1 to `comparison_years`; the year they cross (linearly interpolated to one
  decimal place, matching calculator.net's display) is `breakeven_year` — "buying is cheaper if
  you stay this long or more."

PMI (same <20%-down trigger as mortgage.py, held flat rather than auto-cancelling at 20% equity
— same simplification) and property tax's own annual increase rate (independent of home
appreciation — a mill-rate-style escalation) apply on the buy side; home insurance/PMI/HOA/other
costs share a "costs increase" rate. Both escalation rates are fixed, undocumented-to-the-
household assumptions (2%/yr each, the same "documented simplified constant" convention as
STANDARD_DEDUCTION below) rather than exposed inputs — Home Value Appreciation is the one growth
rate that matters most, and the one the household tunes directly.

Closing costs (buy) and renters insurance (rent) may each be quoted as a flat dollar amount or
as a percentage — of home price for closing costs, of annual rent for renters insurance.
Selling closing costs are a one-time % of the home's appreciated value, applied whenever a sale
is priced in (i.e. at every staying length N, not just the final one, since the whole point of
this calculator is asking "what if I sold at year N" for every N).

Tax treatment: assumes the household itemizes only when mortgage interest + property tax paid
that year exceeds the standard deduction for their filing status (STANDARD_DEDUCTION below —
approximate, single-tax-year constants) — only the excess over the standard deduction gets a
tax benefit, at the combined federal+state marginal rate. Other itemizable items (state income
tax paid, charitable giving, etc.) aren't modeled. Renters insurance is not tax-advantaged in any
way, matching how renting is actually taxed.

Simplifications flagged for the record: no SALT deduction cap, no AMT, security deposit assumed
fully refunded whenever the household stops renting (so it's excluded from the running rent cost
entirely rather than modeled as a temporary outflow), renters insurance held flat year over year
(no separate increase rate — the household's "costs increase" input only drives buy-side costs),
and the break-even year is the *first* point buying goes from more expensive to cheaper — if a
later, unusual combination of inputs flips the ranking back, that second crossing isn't
separately reported (matching calculator.net's single break-even statement)."""

from decimal import Decimal

from app.services.calculators._amortization import amortize
from app.services.calculators._costs import resolve_annual
from app.services.calculators.mortgage import monthly_payment

PMI_REQUIRED_BELOW_DOWN_PAYMENT_PCT = Decimal("0.20")

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
    closing_costs_value: Decimal,
    closing_costs_is_percent: bool,
    annual_rate: Decimal,
    loan_term_years: int,
    property_tax_pct: Decimal,
    home_insurance_pct: Decimal,
    pmi_pct: Decimal,
    hoa_fees_pct: Decimal,
    other_costs_pct: Decimal,
    home_appreciation_pct: Decimal,
    selling_closing_costs_pct: Decimal,
    monthly_rent: Decimal,
    security_deposit: Decimal,
    rent_upfront_cost: Decimal,
    rental_increase_pct: Decimal,
    renters_insurance_value: Decimal,
    renters_insurance_is_percent: bool,
    avg_investment_return: Decimal,
    marginal_federal_rate: Decimal,
    marginal_state_rate: Decimal,
    tax_filing_status: str = "single",
    property_tax_increase_pct: Decimal = Decimal("0.02"),
    costs_increase_pct: Decimal = Decimal("0.02"),
) -> dict:
    down_payment_amount = resolve_annual(down_payment_value, down_payment_is_percent, home_price)
    loan_amount = home_price - down_payment_amount
    if loan_amount <= 0:
        return {"error": "Down payment can't be greater than or equal to the home price."}

    down_payment_pct = down_payment_amount / home_price
    pmi_active = down_payment_pct < PMI_REQUIRED_BELOW_DOWN_PAYMENT_PCT

    payment = monthly_payment(loan_amount, annual_rate, loan_term_years)
    monthly_periods = amortize(loan_amount, annual_rate, payment, payments_per_year=12)["periods"]

    closing_costs_amount = resolve_annual(closing_costs_value, closing_costs_is_percent, home_price)
    annual_rent_year1 = monthly_rent * 12
    renters_insurance_year1 = resolve_annual(renters_insurance_value, renters_insurance_is_percent, annual_rent_year1)
    combined_tax_rate = marginal_federal_rate + marginal_state_rate
    standard_deduction = STANDARD_DEDUCTION.get(tax_filing_status, STANDARD_DEDUCTION["single"])

    # Whoever needs less cash upfront has that difference free to invest — typically the renter,
    # since buying ties up a down payment renting doesn't require. Only the investment *growth*
    # (not the principal, which is already reflected in the two sides' raw outlay difference)
    # is credited as a benefit below.
    upfront_diff = (down_payment_amount + closing_costs_amount) - (security_deposit + rent_upfront_cost)

    schedule = []
    cumulative_buy_outflow = down_payment_amount + closing_costs_amount
    cumulative_rent_outflow = rent_upfront_cost

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
        pmi = home_price * pmi_pct * (1 + costs_increase_pct) ** (year - 1) if pmi_active else Decimal(0)
        hoa = home_price * hoa_fees_pct * (1 + costs_increase_pct) ** (year - 1)
        other_costs = home_price * other_costs_pct * (1 + costs_increase_pct) ** (year - 1)

        itemized = year_interest + property_tax
        tax_shield = max(Decimal(0), itemized - standard_deduction) * combined_tax_rate
        year_buy_outflow = year_pi_payment + property_tax + home_insurance + pmi + hoa + other_costs - tax_shield
        cumulative_buy_outflow += year_buy_outflow

        annual_rent = monthly_rent * 12 * (1 + rental_increase_pct) ** (year - 1)
        year_rent_outflow = annual_rent + renters_insurance_year1
        cumulative_rent_outflow += year_rent_outflow

        net_sale_proceeds = home_value * (1 - selling_closing_costs_pct) - loan_balance
        buy_net_cost = cumulative_buy_outflow - net_sale_proceeds
        rent_net_cost = cumulative_rent_outflow

        investment_growth = abs(upfront_diff) * ((1 + avg_investment_return) ** year - 1)
        if upfront_diff >= 0:
            rent_net_cost -= investment_growth
        else:
            buy_net_cost -= investment_growth

        months = year * 12
        avg_buy_cost = buy_net_cost / months
        avg_rent_cost = rent_net_cost / months

        schedule.append(
            {
                "year": year,
                "home_value": round(home_value, 2),
                "loan_balance": round(loan_balance, 2),
                "home_equity": round(home_value - loan_balance, 2),
                "avg_buy_cost": round(avg_buy_cost, 2),
                "avg_rent_cost": round(avg_rent_cost, 2),
            }
        )

    breakeven_year = None
    if schedule[0]["avg_buy_cost"] <= schedule[0]["avg_rent_cost"]:
        breakeven_year = Decimal(1)
    else:
        for prev, curr in zip(schedule, schedule[1:]):
            prev_diff = prev["avg_buy_cost"] - prev["avg_rent_cost"]
            curr_diff = curr["avg_buy_cost"] - curr["avg_rent_cost"]
            if prev_diff > 0 and curr_diff <= 0:
                frac = prev_diff / (prev_diff - curr_diff) if prev_diff != curr_diff else Decimal(0)
                breakeven_year = round(Decimal(prev["year"]) + frac, 1)
                break

    final = schedule[-1]
    recommendation = "Buying" if final["avg_buy_cost"] <= final["avg_rent_cost"] else "Renting"

    return {
        "recommendation": recommendation,
        "breakeven_year": breakeven_year,
        "home_equity_at_horizon": final["home_equity"],
        "home_value_at_horizon": final["home_value"],
        "avg_buy_cost_at_horizon": final["avg_buy_cost"],
        "avg_rent_cost_at_horizon": final["avg_rent_cost"],
        "schedule": schedule,
    }
