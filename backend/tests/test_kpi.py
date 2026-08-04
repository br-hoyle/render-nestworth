from decimal import Decimal

from app.schemas.settings import DEFAULT_SETTINGS
from app.services.kpi import (
    KpiInputs,
    debt_payoff_runway_months,
    debt_to_assets_ratio,
    debt_to_income,
    emergency_fund_months,
    fi_progress,
    housing_cost_ratio,
    liquid_runway_months,
    liquidity_ratio,
    needs_ratio,
    net_worth_growth_yoy,
    net_worth_velocity,
    savings_efficiency,
    savings_rate,
    savings_ratio,
    target_net_worth,
    wants_ratio,
)


def make_inputs(**overrides) -> KpiInputs:
    defaults = dict(
        net_worth=Decimal("100000"),
        net_worth_one_year_ago=Decimal("80000"),
        total_assets=Decimal("150000"),
        total_liabilities=Decimal("50000"),
        liquid_balance=Decimal("18000"),
        cash_balance=Decimal("12000"),
        gross_annual_income=Decimal("120000"),
        trailing_income=Decimal("30000"),
        trailing_expense=Decimal("24000"),
        trailing_months=3,
        housing_expense_trailing=Decimal("7200"),
        liability_reduction_trailing_6mo=Decimal("6000"),
        settings=DEFAULT_SETTINGS,
    )
    defaults.update(overrides)
    return KpiInputs(**defaults)


def test_emergency_fund_months_green():
    # monthly expense = 24000/3 = 8000; liquid 18000 / 8000 = 2.25mo -> red actually
    value, color = emergency_fund_months(make_inputs())
    assert round(value, 2) == 2.25
    assert color == "red"


def test_emergency_fund_months_green_with_more_liquid():
    value, color = emergency_fund_months(make_inputs(liquid_balance=Decimal("60000")))
    assert value == 7.5
    assert color == "green"


def test_liquidity_ratio():
    value, color = liquidity_ratio(make_inputs())
    # cash 12000 / monthly expense 8000 = 1.5 -> green (>1.0)
    assert value == 1.5
    assert color == "green"


def test_housing_cost_ratio_thresholds():
    # monthly income = 10000; monthly housing = 7200/3=2400 -> 24% -> green
    value, color = housing_cost_ratio(make_inputs())
    assert round(value, 1) == 24.0
    assert color == "green"

    high = make_inputs(housing_expense_trailing=Decimal("12000"))
    value2, color2 = housing_cost_ratio(high)
    assert color2 == "red"


def test_savings_rate():
    # (30000-24000)/30000 = 20% -> green
    value, color = savings_rate(make_inputs())
    assert value == 20.0
    assert color == "green"


def test_savings_rate_no_income_returns_none():
    value, color = savings_rate(make_inputs(trailing_income=Decimal("0")))
    assert value is None
    assert color == "red"


def test_net_worth_growth_yoy():
    value, color = net_worth_growth_yoy(make_inputs())
    assert value == 25.0
    assert color == "green"


def test_net_worth_growth_yoy_negative():
    value, color = net_worth_growth_yoy(make_inputs(net_worth=Decimal("50000")))
    assert value == -37.5
    assert color == "coral"


def test_fi_progress():
    # annual expense = 24000/3*12 = 96000; fi number (target) = 96000/0.04 = 2,400,000
    # progress = 100000/2400000 = 4.1666% -> red
    value, color, progress_pct = fi_progress(make_inputs())
    assert value == 2_400_000.0
    assert round(progress_pct, 2) == 4.17
    assert color == "red"


def test_debt_to_income():
    value, color = debt_to_income(make_inputs())
    # 50000/120000 = 41.67% -> yellow (between 36 and 43)
    assert round(value, 2) == 41.67
    assert color == "yellow"


def test_debt_payoff_runway():
    # 50000 debt / (6000/6=1000 per month) = 50 months -> yellow (<=84)
    value, color = debt_payoff_runway_months(make_inputs())
    assert value == 50.0
    assert color == "yellow"


def test_debt_payoff_runway_no_progress_returns_none():
    value, color = debt_payoff_runway_months(make_inputs(liability_reduction_trailing_6mo=Decimal("0")))
    assert value is None
    assert color == "red"


# --- Backlog pass 2 additions ---


def test_debt_to_assets_ratio():
    # 50000 liabilities / 150000 assets = 33.33% -> yellow (between 30 and 50)
    value, color = debt_to_assets_ratio(make_inputs())
    assert round(value, 2) == 33.33
    assert color == "yellow"


def test_debt_to_assets_ratio_no_assets_no_debt():
    value, color = debt_to_assets_ratio(make_inputs(total_assets=Decimal("0"), total_liabilities=Decimal("0")))
    assert value == 0.0
    assert color == "green"


def test_target_net_worth():
    # income 120000, savings_rate 0.15, roi 0.07, age 40 -> target ~= 781,389.99
    inputs = make_inputs(
        settings={**DEFAULT_SETTINGS, "household_age": 40, "target_net_worth_savings_rate": 0.15, "target_net_worth_roi": 0.07}
    )
    value, color, progress_pct = target_net_worth(inputs)
    assert round(value, 2) == 781389.99
    # progress = 100000/781389.99 = 12.8% -> red (<50)
    assert round(progress_pct, 2) == 12.80
    assert color == "red"


def test_target_net_worth_no_age_returns_none():
    value, color, progress_pct = target_net_worth(make_inputs())
    assert value is None
    assert progress_pct is None
    assert color == "yellow"


def test_liquid_runway_months_uses_needs_when_classified():
    # needs 12000 trailing / 3mo = 4000/mo; liquid 18000 / 4000 = 4.5mo -> yellow
    value, color = liquid_runway_months(make_inputs(needs_expense_trailing=Decimal("12000")))
    assert value == 4.5
    assert color == "yellow"


def test_liquid_runway_months_falls_back_to_overall_expense():
    # unclassified -> falls back to trailing_expense (24000/3=8000/mo); 18000/8000=2.25 -> red
    value, color = liquid_runway_months(make_inputs(needs_expense_trailing=None))
    assert round(value, 2) == 2.25
    assert color == "red"


def test_savings_efficiency():
    # delta net worth = 100000-80000=20000; gross income 12mo = 40000 -> 50% -> green
    value, color = savings_efficiency(make_inputs(gross_income_trailing_12mo=Decimal("40000")))
    assert value == 50.0
    assert color == "green"


def test_savings_efficiency_no_prior_year_returns_none():
    value, color = savings_efficiency(make_inputs(net_worth_one_year_ago=None, gross_income_trailing_12mo=Decimal("40000")))
    assert value is None
    assert color == "yellow"


def test_net_worth_velocity_above_one():
    # delta 20000 / net income 12mo 10000 = 200% -> green (ratio > 1.0)
    value, color = net_worth_velocity(make_inputs(net_income_trailing_12mo=Decimal("10000")))
    assert value == 200.0
    assert color == "green"


def test_needs_wants_savings_ratios_on_target():
    inputs = make_inputs(
        trailing_income=Decimal("10000"),
        needs_expense_trailing=Decimal("5000"),
        wants_expense_trailing=Decimal("3000"),
        savings_flow_trailing=Decimal("2000"),
    )
    needs_val, needs_color = needs_ratio(inputs)
    wants_val, wants_color = wants_ratio(inputs)
    savings_val, savings_color = savings_ratio(inputs)
    assert needs_val == 50.0 and needs_color == "green"
    assert wants_val == 30.0 and wants_color == "green"
    assert savings_val == 20.0 and savings_color == "green"


def test_needs_ratio_far_off_target_is_red():
    inputs = make_inputs(trailing_income=Decimal("10000"), needs_expense_trailing=Decimal("8500"))
    value, color = needs_ratio(inputs)
    assert value == 85.0
    assert color == "red"
