"""
The 11 KPI formulas from CLAUDE.md, as pure functions over already-fetched primitives (no
DB access here — see routers/scorecard.py for the data-fetching glue). Each returns a
(value, color) pair; color is computed from the household's configured thresholds via
`color_for`. Two documented, transparent simplifications given the schema as provided
(spelled out again in docs/KPI_FORMULAS.md):

- Debt-to-income uses total liability balance ÷ annual income (a stock/flow ratio), not a
  monthly required-payment ratio — the schema has no loan-payment field to compute the
  latter. The classic 36/43 thresholds are kept as directional guidance, not underwriting
  rules.
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
    if i.trailing_expense <= 0:
        return None, "yellow"
    monthly_expense = i.trailing_expense / i.trailing_months
    if monthly_expense <= 0:
        return None, "yellow"
    months = float(i.liquid_balance / monthly_expense)
    red = _threshold(i.settings, "emergency_fund", "red_below", 3)
    green = _threshold(i.settings, "emergency_fund", "green_at_or_above", 6)
    return months, color_for_higher_is_better(months, red, green)


def liquidity_ratio(i: KpiInputs) -> tuple[float | None, str]:
    if i.trailing_expense <= 0:
        return None, "yellow"
    monthly_expense = i.trailing_expense / i.trailing_months
    if monthly_expense <= 0:
        return None, "yellow"
    ratio = float(i.cash_balance / monthly_expense)
    red = _threshold(i.settings, "liquidity_ratio", "red_below", 0.5)
    green = _threshold(i.settings, "liquidity_ratio", "green_at_or_above", 1.0)
    return ratio, color_for_higher_is_better(ratio, red, green)


def housing_cost_ratio(i: KpiInputs) -> tuple[float | None, str]:
    if i.gross_annual_income <= 0:
        return None, "red"
    monthly_income = i.gross_annual_income / 12
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


def capital_deployment_rate(i: KpiInputs) -> tuple[float | None, str]:
    if i.savings_flow_trailing is None:
        return None, "yellow"
    net_income = i.trailing_income - i.trailing_expense
    if net_income <= 0:
        return None, "red"
    rate_pct = float(i.savings_flow_trailing / net_income * 100)
    red = _threshold(i.settings, "capital_deployment_rate", "red_below", 10)
    green = _threshold(i.settings, "capital_deployment_rate", "green_at_or_above", 20)
    return rate_pct, color_for_higher_is_better(rate_pct, red, green)


def liquid_runway_months(i: KpiInputs) -> tuple[float | None, str]:
    if i.needs_expense_trailing is not None and i.needs_expense_trailing > 0:
        monthly_needs = i.needs_expense_trailing / i.trailing_months
    elif i.trailing_expense > 0:
        # Fallback: household hasn't classified transactions yet — use overall expense.
        monthly_needs = i.trailing_expense / i.trailing_months
    else:
        return None, "yellow"
    months = float(i.liquid_balance / monthly_needs)
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


def savings_ratio(i: KpiInputs) -> tuple[float | None, str]:
    return _budget_rule_ratio(i, i.savings_flow_trailing, "savings_ratio", 20)


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
    target = fi_number(i)
    if target <= 0:
        return None, "yellow"
    progress_pct = float(i.net_worth / target * 100)
    red = _threshold(i.settings, "fi_progress", "red_below", 50)
    green = _threshold(i.settings, "fi_progress", "green_at_or_above", 100)
    return progress_pct, color_for_higher_is_better(progress_pct, red, green)


def debt_to_income(i: KpiInputs) -> tuple[float | None, str]:
    if i.gross_annual_income <= 0:
        return None, "red"
    ratio_pct = float(i.total_liabilities / i.gross_annual_income * 100)
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


def net_worth_value(i: KpiInputs) -> tuple[float, str]:
    return float(i.net_worth), ("green" if i.net_worth >= 0 else "coral")
