from pydantic import BaseModel, ConfigDict

# Default per-metric threshold boundaries. `green_min`/`yellow_min` are the value at/above
# which the metric turns that color; for "lower is better" metrics (debt_to_income,
# housing_cost_ratio) the sense is inverted — see services/kpi.py THRESHOLD_DIRECTIONS.
DEFAULT_KPI_THRESHOLDS = {
    "emergency_fund": {"red_below": 3, "green_at_or_above": 6},
    "liquidity_ratio": {"red_below": 0.5, "green_at_or_above": 1.0},
    "housing_cost_ratio": {"green_below": 28, "red_at_or_above": 36},
    "savings_rate": {"red_below": 5, "green_at_or_above": 15},
    "debt_to_income": {"green_below": 36, "red_at_or_above": 43},
    # Retrofitted from previously-hardcoded bands, for consistency (backlog pass 2):
    "fi_progress": {"red_below": 50, "green_at_or_above": 100},
    "debt_payoff_runway": {"green_below": 36, "red_at_or_above": 84},
    # New in backlog pass 2:
    "debt_to_assets_ratio": {"green_below": 30, "red_at_or_above": 50},
    "liquid_runway": {"red_below": 3, "green_at_or_above": 6},
    # Percent-of-target thresholds, same banding convention as fi_progress.
    "target_net_worth": {"red_below": 50, "green_at_or_above": 100},
    "savings_efficiency": {"red_below": 0, "green_at_or_above": 20},
    "net_worth_velocity": {"red_below": 0, "green_at_or_above": 100},
    # 50/30/20 rule — still computed for Cash Flow's needs/wants trend charts even though
    # the Scorecard's own "Budget rule" section was removed; not user-facing as tiles here.
    "needs_ratio": {"target": 50, "green_tolerance": 5, "yellow_tolerance": 15},
    "wants_ratio": {"target": 30, "green_tolerance": 5, "yellow_tolerance": 15},
    # Scorecard overhaul additions:
    "discretionary_spending_rate": {"green_below": 30, "red_at_or_above": 45},
    "net_income_rate": {"red_below": 50, "green_at_or_above": 70},
    "income_growth_rate": {"red_below": 90, "green_at_or_above": 105},
    "housing_debt_to_equity": {"green_below": 100, "red_at_or_above": 300},
}

DEFAULT_SETTINGS = {
    "stale_threshold_days": 30,
    "default_range_months": 12,
    "liquid_account_types": ["Checking", "Savings"],
    "cash_account_types": ["Checking", "Savings"],
    "expense_basis": "3mo",  # "3mo" | "12mo" | "manual"
    "manual_monthly_expense": None,
    "fi_withdrawal_rate": 0.04,
    "fi_number_override": None,
    # Assumptions for the Target Net Worth projection (age-based savings-annuity model).
    "target_net_worth_savings_rate": 0.15,
    "target_net_worth_roi": 0.07,
    "household_age": None,
    # Assumptions for the Future Investment/Retirement Balance projections — distinct from
    # target_net_worth_roi above, which feeds the separate age-based annuity projection.
    "target_retirement_age": 65,
    "expected_return_rate": 0.10,
    "monthly_investment_contribution": 0,
    "monthly_retirement_contribution": 0,
    "kpi_thresholds": DEFAULT_KPI_THRESHOLDS,
    "theme_preference": "system",  # "system" | "light" | "dark"
}


class HouseholdSettings(BaseModel):
    """Single source of truth for household-configurable preferences (CLAUDE.md's phrase).
    `extra="allow"` because later features add keys to this same JSONB blob without a
    schema migration."""

    model_config = ConfigDict(extra="allow")

    stale_threshold_days: int = 30
    default_range_months: int = 12
    liquid_account_types: list[str] = ["Checking", "Savings"]
    cash_account_types: list[str] = ["Checking", "Savings"]
    expense_basis: str = "3mo"
    manual_monthly_expense: float | None = None
    fi_withdrawal_rate: float = 0.04
    fi_number_override: float | None = None
    target_net_worth_savings_rate: float = 0.15
    target_net_worth_roi: float = 0.07
    household_age: int | None = None
    target_retirement_age: int | None = 65
    expected_return_rate: float = 0.10
    monthly_investment_contribution: float = 0
    monthly_retirement_contribution: float = 0
    kpi_thresholds: dict = DEFAULT_KPI_THRESHOLDS
    theme_preference: str = "system"


def _merge_one_level(defaults: dict, stored: dict) -> dict:
    merged = dict(defaults)
    for key, value in stored.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    return merged


def merge_with_defaults(stored: dict) -> dict:
    return _merge_one_level(DEFAULT_SETTINGS, stored)
