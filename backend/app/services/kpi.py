"""
KPI formulas backing the Scorecard, as pure functions over already-fetched primitives (no
DB access here — see routers/scorecard.py for the data-fetching glue). Each returns a
(value, color) pair (or a 3-tuple with progress_pct for dollar-target metrics); color is
computed from the household's configured thresholds via `color_for`. A "neutral" color is
used for purely informational dollar figures with no natural good/bad direction (Total
Debt, the two forward-looking balance projections) — it renders as a grey dot rather than
implying a judgment. Documented, transparent simplifications given the schema as provided
(spelled out again in docs/KPI_FORMULAS.md):

- Debt-to-income estimates the "recurring monthly debt payment" as the trailing 3-month
  average pace of total liability paydown (total liabilities 3 months ago − now, ÷ 3) —
  the schema has no loan-payment/APR/term field to compute a real payment amount. This
  only reads as a payment when liabilities are actually shrinking; if they're flat or
  growing there's no pace to infer a payment from, and the metric reports unavailable
  rather than guessing.
- Housing Debt-to-Equity and the two Future Balance projections aggregate accounts by
  `category` (Property / Investment / Retirement) household-wide — multiple properties or
  investment accounts are summed together rather than tracked per-property.
- The two Future Balance projections (Future Investment Balance, Future Retirement
  Balance) require `household_age` and `target_retirement_age` to both be set; there is no
  persisted "years to retirement" anywhere else in the schema (Scenarios, which would have
  held this, were removed).
"""

from dataclasses import dataclass
from decimal import Decimal

Number = Decimal | float | int


@dataclass
class KpiInputs:
    net_worth: Decimal
    net_worth_one_year_ago: Decimal | None
    total_assets: Decimal
    total_liabilities: Decimal
    liquid_balance: Decimal
    cash_balance: Decimal
    gross_annual_income: Decimal
    trailing_income: Decimal
    trailing_expense: Decimal
    trailing_months: int
    housing_expense_trailing: Decimal
    liability_reduction_trailing_6mo: Decimal  # positive = paid down
    settings: dict
    # Added in backlog pass 2 — sourced from transaction_categories (needs/wants/savings),
    # None when the household hasn't classified any transactions yet (documented fallback).
    needs_expense_trailing: Decimal | None = None
    wants_expense_trailing: Decimal | None = None
    savings_flow_trailing: Decimal | None = None
    # Fixed 12-month window (independent of the expense_basis trailing window), matching
    # net_worth_growth_yoy's existing 1-year comparison — used by Savings Efficiency and
    # Net Worth Velocity.
    gross_income_trailing_12mo: Decimal = Decimal(0)
    net_income_trailing_12mo: Decimal = Decimal(0)
    # Scorecard overhaul additions:
    liability_reduction_trailing_3mo: Decimal = Decimal(0)  # positive = paid down; feeds DTI
    property_asset_value: Decimal = Decimal(0)  # sum of Property-category asset accounts
    property_liability_value: Decimal = Decimal(0)  # sum of Property-category liability accounts
    investment_asset_value: Decimal = Decimal(0)  # sum of Investment-category asset accounts
    retirement_asset_value: Decimal = Decimal(0)  # sum of Retirement-category asset accounts
    current_month_income: Decimal = Decimal(0)  # actual income transactions, this calendar month
    trailing_12mo_avg_income: Decimal | None = None  # avg of the 12 full months before this one


def _threshold(settings: dict, slug: str, key: str, default: float) -> float:
    return settings.get("kpi_thresholds", {}).get(slug, {}).get(key, default)


def color_for_higher_is_better(value: float | None, red_below: float, green_at_or_above: float) -> str:
    if value is None:
        return "red"
    if value >= green_at_or_above:
        return "green"
    if value < red_below:
        return "red"
    return "yellow"


def color_for_lower_is_better(value: float | None, green_below: float, red_at_or_above: float) -> str:
    if value is None:
        return "red"
    if value < green_below:
        return "green"
    if value >= red_at_or_above:
        return "red"
    return "yellow"


def color_for_target(value: float | None, target: float, green_tolerance: float, yellow_tolerance: float) -> str:
    """For metrics banded around a target rather than monotonically better/worse — e.g. the
    50/30/20 rule, where being too far below *or* above the target is equally undesirable."""
    if value is None:
        return "red"
    distance = abs(value - target)
    if distance <= green_tolerance:
        return "green"
    if distance <= yellow_tolerance:
        return "yellow"
    return "red"


def emergency_fund_months(i: KpiInputs) -> tuple[float | None, str]:
    """Cash reserves ÷ average monthly "needs" expense — the narrowest, most conservative
    reading of "could I cover essentials with cash on hand." Falls back to overall trailing
    expense until the household classifies transactions as needs/wants (documented fallback,
    same convention as liquid_runway used previously)."""
    needs_expense = i.needs_expense_trailing if i.needs_expense_trailing is not None else i.trailing_expense
    if needs_expense <= 0:
        return None, "yellow"
    monthly_needs = needs_expense / i.trailing_months
    if monthly_needs <= 0:
        return None, "yellow"
    months = float(i.cash_balance / monthly_needs)
    red = _threshold(i.settings, "emergency_fund", "red_below", 3)
    green = _threshold(i.settings, "emergency_fund", "green_at_or_above", 6)
    return months, color_for_higher_is_better(months, red, green)


def liquidity_ratio(i: KpiInputs) -> tuple[float | None, str]:
    """Liquid assets ÷ average monthly cash outflow (total trailing expense). Deliberately
    the same numerator/denominator as liquid_runway_months below — this shows the identical
    underlying figure as a unitless ratio rather than a month count, for a more analytical
    reading of the same signal."""
    if i.trailing_expense <= 0:
        return None, "yellow"
    monthly_expense = i.trailing_expense / i.trailing_months
    if monthly_expense <= 0:
        return None, "yellow"
    ratio = float(i.liquid_balance / monthly_expense)
    red = _threshold(i.settings, "liquidity_ratio", "red_below", 0.5)
    green = _threshold(i.settings, "liquidity_ratio", "green_at_or_above", 1.0)
    return ratio, color_for_higher_is_better(ratio, red, green)


def housing_cost_ratio(i: KpiInputs) -> tuple[float | None, str]:
    """Monthly housing expense ÷ monthly NET income (actual banked income transactions over
    the trailing window, not the on-paper gross annual figure) — reads higher than a
    gross-income version of the same housing cost, since net < gross; the default 28/36
    thresholds are carried over unchanged and are household-configurable if that calibration
    doesn't fit."""
    if i.trailing_income <= 0:
        return None, "red"
    monthly_income = i.trailing_income / i.trailing_months
    monthly_housing = i.housing_expense_trailing / i.trailing_months
    ratio_pct = float(monthly_housing / monthly_income * 100)
    green = _threshold(i.settings, "housing_cost_ratio", "green_below", 28)
    red = _threshold(i.settings, "housing_cost_ratio", "red_at_or_above", 36)
    return ratio_pct, color_for_lower_is_better(ratio_pct, green, red)


def savings_rate(i: KpiInputs) -> tuple[float | None, str]:
    if i.trailing_income <= 0:
        return None, "red"
    rate_pct = float((i.trailing_income - i.trailing_expense) / i.trailing_income * 100)
    red = _threshold(i.settings, "savings_rate", "red_below", 5)
    green = _threshold(i.settings, "savings_rate", "green_at_or_above", 15)
    return rate_pct, color_for_higher_is_better(rate_pct, red, green)


def net_worth_growth_yoy(i: KpiInputs) -> tuple[float | None, str]:
    if i.net_worth_one_year_ago is None or i.net_worth_one_year_ago == 0:
        return None, "yellow"
    growth_pct = float((i.net_worth - i.net_worth_one_year_ago) / abs(i.net_worth_one_year_ago) * 100)
    color = "green" if growth_pct >= 0 else "coral"
    return growth_pct, color


def debt_to_assets_ratio(i: KpiInputs) -> tuple[float | None, str]:
    if i.total_assets <= 0:
        return (None, "red") if i.total_liabilities > 0 else (0.0, "green")
    ratio_pct = float(i.total_liabilities / i.total_assets * 100)
    green = _threshold(i.settings, "debt_to_assets_ratio", "green_below", 30)
    red = _threshold(i.settings, "debt_to_assets_ratio", "red_at_or_above", 50)
    return ratio_pct, color_for_lower_is_better(ratio_pct, green, red)


def liquid_runway_months(i: KpiInputs) -> tuple[float | None, str]:
    """Liquid assets ÷ average monthly TOTAL expense (not needs-only) — broader than
    Emergency Fund's cash-and-needs-only reading, since it counts every liquid account and
    every expense dollar."""
    if i.trailing_expense <= 0:
        return None, "yellow"
    monthly_expense = i.trailing_expense / i.trailing_months
    if monthly_expense <= 0:
        return None, "yellow"
    months = float(i.liquid_balance / monthly_expense)
    red = _threshold(i.settings, "liquid_runway", "red_below", 3)
    green = _threshold(i.settings, "liquid_runway", "green_at_or_above", 6)
    return months, color_for_higher_is_better(months, red, green)


def savings_efficiency(i: KpiInputs) -> tuple[float | None, str]:
    if i.net_worth_one_year_ago is None or i.gross_income_trailing_12mo <= 0:
        return None, "yellow"
    delta = i.net_worth - i.net_worth_one_year_ago
    rate_pct = float(delta / i.gross_income_trailing_12mo * 100)
    red = _threshold(i.settings, "savings_efficiency", "red_below", 0)
    green = _threshold(i.settings, "savings_efficiency", "green_at_or_above", 20)
    return rate_pct, color_for_higher_is_better(rate_pct, red, green)


def net_worth_velocity(i: KpiInputs) -> tuple[float | None, str]:
    if i.net_worth_one_year_ago is None or i.net_income_trailing_12mo <= 0:
        return None, "yellow"
    delta = i.net_worth - i.net_worth_one_year_ago
    rate_pct = float(delta / i.net_income_trailing_12mo * 100)
    red = _threshold(i.settings, "net_worth_velocity", "red_below", 0)
    green = _threshold(i.settings, "net_worth_velocity", "green_at_or_above", 100)
    return rate_pct, color_for_higher_is_better(rate_pct, red, green)


def _budget_rule_ratio(i: KpiInputs, flow_amount: Decimal | None, slug: str, target: float) -> tuple[float | None, str]:
    if flow_amount is None or i.trailing_income <= 0:
        return None, "yellow"
    rate_pct = float(flow_amount / i.trailing_income * 100)
    green_tol = _threshold(i.settings, slug, "green_tolerance", 5)
    yellow_tol = _threshold(i.settings, slug, "yellow_tolerance", 15)
    return rate_pct, color_for_target(rate_pct, target, green_tol, yellow_tol)


def needs_ratio(i: KpiInputs) -> tuple[float | None, str]:
    return _budget_rule_ratio(i, i.needs_expense_trailing, "needs_ratio", 50)


def wants_ratio(i: KpiInputs) -> tuple[float | None, str]:
    return _budget_rule_ratio(i, i.wants_expense_trailing, "wants_ratio", 30)


def fi_number(i: KpiInputs) -> Decimal:
    override = i.settings.get("fi_number_override")
    if override is not None:
        return Decimal(str(override))
    withdrawal_rate = Decimal(str(i.settings.get("fi_withdrawal_rate", 0.04)))
    annual_expense = (i.trailing_expense / i.trailing_months) * 12
    if withdrawal_rate <= 0:
        return Decimal(0)
    return annual_expense / withdrawal_rate


def fi_progress(i: KpiInputs) -> tuple[float | None, str]:
    """Returns (target dollar amount, color) — the headline value is the FI number itself.
    Progress-to-target is intentionally NOT returned here: per the household's explicit
    request, this tile shows only the target figure with no progress bar, and the
    percent-to-target is instead surfaced on the Net Worth tile (see net_worth_value),
    which shows the CURRENT dollar figure that's actually progressing toward this target.
    Color still reflects the same underlying progress internally, just isn't exposed as a
    number here."""
    target = fi_number(i)
    if target <= 0:
        return None, "yellow"
    progress_pct = float(i.net_worth / target * 100)
    red = _threshold(i.settings, "fi_progress", "red_below", 50)
    green = _threshold(i.settings, "fi_progress", "green_at_or_above", 100)
    color = color_for_higher_is_better(progress_pct, red, green)
    return float(target), color


def target_net_worth(i: KpiInputs) -> tuple[float | None, str, float | None]:
    """Projects the net worth a household "should" have by now if they'd saved a fixed
    fraction of income every month from age 20 onward at a fixed annualized return — a
    future-value-of-an-annuity model, distinct from fi_progress's expense-based FI number.
    Returns (target dollar amount, color, progress-to-target percent); requires household_age
    to be configured (no schema field for birth date/age otherwise exists)."""
    age = i.settings.get("household_age")
    roi = i.settings.get("target_net_worth_roi", 0.07)
    savings_rate = i.settings.get("target_net_worth_savings_rate", 0.15)
    if age is None or i.gross_annual_income <= 0 or roi <= 0:
        return None, "yellow", None
    months = (age - 20) * 12
    if months <= 0:
        return None, "yellow", None
    monthly_rate = roi / 12
    monthly_savings = float(i.gross_annual_income) / 12 * savings_rate
    target = monthly_savings * (((1 + monthly_rate) ** months) / monthly_rate - 1 / monthly_rate)
    if target <= 0:
        return None, "yellow", None
    progress_pct = float(i.net_worth) / target * 100
    red = _threshold(i.settings, "target_net_worth", "red_below", 50)
    green = _threshold(i.settings, "target_net_worth", "green_at_or_above", 100)
    color = color_for_higher_is_better(progress_pct, red, green)
    return target, color, progress_pct


def debt_to_income(i: KpiInputs) -> tuple[float | None, str]:
    """Estimated recurring monthly debt payment ÷ monthly gross income. The "payment" is
    estimated as the trailing 3-month average pace of total-liability paydown — the schema
    has no loan-payment field, so this proxies "payment" with "principal actually going
    away." Only meaningful when debt is shrinking: flat or growing balances mean there's no
    paydown pace to infer a payment from, so the metric reports unavailable rather than a
    misleading 0% or negative figure."""
    if i.total_liabilities <= 0:
        return 0.0, "green"
    if i.gross_annual_income <= 0:
        return None, "red"
    monthly_payment_estimate = i.liability_reduction_trailing_3mo / 3
    if monthly_payment_estimate <= 0:
        return None, "red"
    monthly_income = i.gross_annual_income / 12
    ratio_pct = float(monthly_payment_estimate / monthly_income * 100)
    green = _threshold(i.settings, "debt_to_income", "green_below", 36)
    red = _threshold(i.settings, "debt_to_income", "red_at_or_above", 43)
    return ratio_pct, color_for_lower_is_better(ratio_pct, green, red)


def debt_payoff_runway_months(i: KpiInputs) -> tuple[float | None, str]:
    if i.total_liabilities <= 0:
        return 0.0, "green"
    monthly_pace = i.liability_reduction_trailing_6mo / 6
    if monthly_pace <= 0:
        return None, "red"
    months = float(i.total_liabilities / monthly_pace)
    green = _threshold(i.settings, "debt_payoff_runway", "green_below", 36)
    red = _threshold(i.settings, "debt_payoff_runway", "red_at_or_above", 84)
    return months, color_for_lower_is_better(months, green, red)


def net_worth_value(i: KpiInputs) -> tuple[float, str, float | None]:
    """Color stays sign-based (green/coral) regardless of FI progress — that judgment is
    about solvency, not about being "behind" on a savings goal. progress_pct (net worth ÷
    the same FI number fi_progress targets) is included purely as extra data for the
    tile's progress bar/target display; moved here from fi_progress per the household's
    explicit request."""
    color = "green" if i.net_worth >= 0 else "coral"
    target = fi_number(i)
    progress_pct = float(i.net_worth / target * 100) if target > 0 else None
    return float(i.net_worth), color, progress_pct


def total_debt_value(i: KpiInputs) -> tuple[float, str]:
    """Raw dollar total of every liability — informational, not graded: there's no
    household-size-independent threshold for what a "good" absolute debt total is. The
    household's goal for this figure is $0; the Scorecard's %-to-goal for this metric is
    computed frontend-side from its own history (see targetInfoFor's zero-goal handling),
    since there's no non-zero denominator to divide by here."""
    return float(i.total_liabilities), "neutral"


def total_non_property_debt_value(i: KpiInputs) -> tuple[float, str]:
    """Every liability EXCEPT mortgages/HELOCs/etc — the debt that isn't secured by (and
    roughly offset by) a home's value, so it reads as the more urgent payoff target. Same
    $0-goal / history-relative %-to-goal treatment as Total Debt."""
    return float(i.total_liabilities - i.property_liability_value), "neutral"


def net_cash_flow(i: KpiInputs) -> tuple[float, str]:
    """Trailing income − trailing expense, in dollars — the same trailing window as
    Savings Rate, just expressed as a dollar amount instead of a percent."""
    value = float(i.trailing_income - i.trailing_expense)
    return value, ("green" if value >= 0 else "coral")


def discretionary_spending_rate(i: KpiInputs) -> tuple[float | None, str]:
    """Trailing "wants"-classified expense ÷ trailing income × 100. None until the
    household classifies transactions (same fallback convention as the other
    needs/wants-dependent metrics)."""
    if i.wants_expense_trailing is None or i.trailing_income <= 0:
        return None, "yellow"
    rate_pct = float(i.wants_expense_trailing / i.trailing_income * 100)
    green = _threshold(i.settings, "discretionary_spending_rate", "green_below", 30)
    red = _threshold(i.settings, "discretionary_spending_rate", "red_at_or_above", 45)
    return rate_pct, color_for_lower_is_better(rate_pct, green, red)


def net_income_rate(i: KpiInputs) -> tuple[float | None, str]:
    """Trailing NET income (actual banked income transactions) ÷ trailing GROSS income
    (the on-paper annualized figure, held flat over the trailing window as an
    approximation) × 100 — the share of gross pay that actually shows up as income."""
    gross_over_window = i.gross_annual_income / 12 * i.trailing_months
    if gross_over_window <= 0:
        return None, "red"
    rate_pct = float(i.trailing_income / gross_over_window * 100)
    red = _threshold(i.settings, "net_income_rate", "red_below", 50)
    green = _threshold(i.settings, "net_income_rate", "green_at_or_above", 70)
    return rate_pct, color_for_higher_is_better(rate_pct, red, green)


def income_growth_rate(i: KpiInputs) -> tuple[float | None, str]:
    """This calendar month's actual income transactions ÷ the average of the 12 full
    calendar months before it × 100 — a "pace vs. trailing average" reading (100% = right
    on pace), the same convention Cash Flow's Category Drift chart uses for expenses, just
    on income with a 12-month window. None until 12 full prior months of transaction
    history exist."""
    if i.trailing_12mo_avg_income is None or i.trailing_12mo_avg_income <= 0:
        return None, "yellow"
    ratio_pct = float(i.current_month_income / i.trailing_12mo_avg_income * 100)
    red = _threshold(i.settings, "income_growth_rate", "red_below", 90)
    green = _threshold(i.settings, "income_growth_rate", "green_at_or_above", 105)
    return ratio_pct, color_for_higher_is_better(ratio_pct, red, green)


def housing_debt_to_equity(i: KpiInputs) -> tuple[float | None, str]:
    """Property-category liabilities (mortgages, HELOCs, etc.) ÷ property-category home
    equity (property assets − property liabilities), household-wide. None (neutral) when
    no property is tracked at all — renders as "not applicable" rather than a red flag."""
    if i.property_asset_value <= 0:
        return (None, "red") if i.property_liability_value > 0 else (None, "neutral")
    equity = i.property_asset_value - i.property_liability_value
    if equity <= 0:
        # Underwater (or exactly zero equity) — the ratio is undefined/unbounded rather
        # than a finite percentage worth displaying.
        return None, "red"
    ratio_pct = float(i.property_liability_value / equity * 100)
    green = _threshold(i.settings, "housing_debt_to_equity", "green_below", 100)
    red = _threshold(i.settings, "housing_debt_to_equity", "red_at_or_above", 300)
    return ratio_pct, color_for_lower_is_better(ratio_pct, green, red)


def _future_balance(current_balance: Decimal, monthly_contribution_key: str, i: KpiInputs) -> tuple[float | None, str]:
    """Shared compounding projection for Future Investment/Retirement Balance: the current
    category balance, grown monthly at settings.expected_return_rate with a flat monthly
    contribution added each month, from household_age to target_retirement_age. Both ages
    must be configured (Settings) or this returns None — there's nowhere else in the schema
    a "years to retirement" figure could come from."""
    age = i.settings.get("household_age")
    retirement_age = i.settings.get("target_retirement_age")
    return_rate = i.settings.get("expected_return_rate", 0.10)
    if age is None or retirement_age is None or retirement_age <= age or return_rate is None or return_rate <= 0:
        return None, "neutral"
    monthly_contribution = Decimal(str(i.settings.get(monthly_contribution_key, 0) or 0))
    months = (retirement_age - age) * 12
    monthly_rate = Decimal(str(return_rate)) / 12
    balance = current_balance
    for _ in range(months):
        balance = balance * (1 + monthly_rate) + monthly_contribution
    return float(balance), "neutral"


def future_investment_balance(i: KpiInputs) -> tuple[float | None, str]:
    return _future_balance(i.investment_asset_value, "monthly_investment_contribution", i)


def future_retirement_balance(i: KpiInputs) -> tuple[float | None, str]:
    return _future_balance(i.retirement_asset_value, "monthly_retirement_contribution", i)
