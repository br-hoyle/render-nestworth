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
- Retirement contribution rate is derived from transactions tagged with a "Retirement"-ish
  group (heuristic, since the schema has no dedicated contribution flag), with a manual
  override available in settings for households that don't tag it that way.
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
    assets_by_category: dict[str, Decimal]
    gross_annual_income: Decimal
    trailing_income: Decimal
    trailing_expense: Decimal
    trailing_months: int
    housing_expense_trailing: Decimal
    retirement_contribution_trailing: Decimal | None  # None -> use manual override / unknown
    liability_reduction_trailing_6mo: Decimal  # positive = paid down
    settings: dict


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


def retirement_contribution_rate(i: KpiInputs) -> tuple[float | None, str]:
    override = i.settings.get("retirement_contribution_rate_override")
    if override is not None:
        rate_pct = float(override)
    elif i.retirement_contribution_trailing is not None and i.gross_annual_income > 0:
        annualized = i.retirement_contribution_trailing / i.trailing_months * 12
        rate_pct = float(annualized / i.gross_annual_income * 100)
    else:
        return None, "yellow"
    red = _threshold(i.settings, "retirement_contribution_rate", "red_below", 5)
    green = _threshold(i.settings, "retirement_contribution_rate", "green_at_or_above", 15)
    return rate_pct, color_for_higher_is_better(rate_pct, red, green)


def net_worth_growth_yoy(i: KpiInputs) -> tuple[float | None, str]:
    if i.net_worth_one_year_ago is None or i.net_worth_one_year_ago == 0:
        return None, "yellow"
    growth_pct = float((i.net_worth - i.net_worth_one_year_ago) / abs(i.net_worth_one_year_ago) * 100)
    color = "green" if growth_pct >= 0 else "coral"
    return growth_pct, color


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
    color = "green" if progress_pct >= 100 else ("yellow" if progress_pct >= 50 else "red")
    return progress_pct, color


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
    color = "green" if months <= 36 else ("yellow" if months <= 84 else "red")
    return months, color


def net_worth_value(i: KpiInputs) -> tuple[float, str]:
    return float(i.net_worth), ("green" if i.net_worth >= 0 else "coral")


def allocation_mix(i: KpiInputs) -> dict[str, float]:
    total = sum(i.assets_by_category.values())
    if total <= 0:
        return {}
    return {category: float(amount / total * 100) for category, amount in i.assets_by_category.items()}
