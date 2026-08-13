from decimal import Decimal

import pytest

from app.schemas.settings import DEFAULT_SETTINGS
from app.services.kpi import (
    KpiInputs,
    debt_payoff_runway_months,
    debt_to_assets_ratio,
    debt_to_income,
    discretionary_spending_rate,
    emergency_fund_months,
    fi_progress,
    future_investment_balance,
    future_retirement_balance,
    housing_cost_ratio,
    housing_debt_to_equity,
    income_growth_rate,
    liquid_runway_months,
    liquidity_ratio,
    needs_ratio,
    net_cash_flow,
    net_income_rate,
    net_worth_growth_yoy,
    net_worth_value,
    net_worth_velocity,
    savings_efficiency,
    savings_rate,
    target_net_worth,
    total_debt_value,
    total_non_property_debt_value,
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
        liability_reduction_trailing_3mo=Decimal("3000"),
        settings=DEFAULT_SETTINGS,
    )
    defaults.update(overrides)
    return KpiInputs(**defaults)


def test_emergency_fund_months_uses_cash_and_falls_back_to_overall_expense():
    # unclassified -> falls back to trailing_expense (24000/3=8000/mo); cash 12000/8000=1.5 -> red
    value, color = emergency_fund_months(make_inputs())
    assert value == 1.5
    assert color == "red"


def test_emergency_fund_months_uses_needs_expense_when_classified():
    # needs 12000/3mo=4000/mo; cash 12000/4000=3.0 -> exactly at red_below, not yet green -> yellow
    value, color = emergency_fund_months(make_inputs(needs_expense_trailing=Decimal("12000")))
    assert value == 3.0
    assert color == "yellow"


def test_emergency_fund_months_green_with_more_cash():
    value, color = emergency_fund_months(make_inputs(cash_balance=Decimal("60000")))
    assert value == 7.5
    assert color == "green"


def test_liquidity_ratio_uses_liquid_balance():
    # liquid 18000 / monthly expense 8000 = 2.25 -> green (>=1.0)
    value, color = liquidity_ratio(make_inputs())
    assert value == 2.25
    assert color == "green"


def test_liquid_runway_months_uses_total_expense_not_needs():
    # liquid 18000 / monthly total expense 8000 = 2.25 -> red (<3)
    value, color = liquid_runway_months(make_inputs())
    assert value == 2.25
    assert color == "red"

    # Setting needs_expense_trailing must NOT change liquid_runway (that's emergency_fund's job).
    value_with_needs, color_with_needs = liquid_runway_months(make_inputs(needs_expense_trailing=Decimal("4000")))
    assert value_with_needs == value
    assert color_with_needs == color


def test_housing_cost_ratio_uses_net_trailing_income():
    # monthly net income = 30000/3=10000; monthly housing = 7200/3=2400 -> 24% -> green
    value, color = housing_cost_ratio(make_inputs())
    assert round(value, 1) == 24.0
    assert color == "green"

    high = make_inputs(housing_expense_trailing=Decimal("12000"))
    value2, color2 = housing_cost_ratio(high)
    assert color2 == "red"


def test_housing_cost_ratio_diverges_from_gross_income():
    # trailing_income (net) much lower than gross_annual_income/12 would suggest — confirms the
    # ratio is computed against trailing_income, not gross_annual_income.
    inputs = make_inputs(trailing_income=Decimal("9000"), gross_annual_income=Decimal("600000"))
    # monthly net income = 9000/3=3000; monthly housing=7200/3=2400 -> 80% -> red
    value, color = housing_cost_ratio(inputs)
    assert round(value, 1) == 80.0
    assert color == "red"


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
    # progress (internal, for color only) = 100000/2400000 = 4.1666% -> red; no progress_pct
    # is returned — that now lives on net_worth_value instead.
    value, color = fi_progress(make_inputs())
    assert value == 2_400_000.0
    assert color == "red"


def test_net_worth_value_carries_fi_progress_to_target():
    # Same FI number as above (2,400,000); net worth 100000 -> progress 4.1666%. Color stays
    # sign-based (green), independent of that progress percentage.
    value, color, progress_pct = net_worth_value(make_inputs())
    assert value == 100000.0
    assert color == "green"
    assert round(progress_pct, 2) == 4.17


def test_net_worth_value_negative_is_coral_regardless_of_progress():
    value, color, progress_pct = net_worth_value(make_inputs(net_worth=Decimal("-5000")))
    assert value == -5000.0
    assert color == "coral"
    assert progress_pct is not None


def test_debt_to_income_from_paydown_pace():
    # monthly payment estimate = 3000/3=1000; monthly gross income = 10000 -> 10% -> green
    value, color = debt_to_income(make_inputs())
    assert round(value, 2) == 10.0
    assert color == "green"


def test_debt_to_income_no_paydown_progress_returns_none():
    value, color = debt_to_income(make_inputs(liability_reduction_trailing_3mo=Decimal("0")))
    assert value is None
    assert color == "red"


def test_debt_to_income_debt_free():
    value, color = debt_to_income(make_inputs(total_liabilities=Decimal("0")))
    assert value == 0.0
    assert color == "green"


def test_debt_payoff_runway():
    # 50000 debt / (6000/6=1000 per month) = 50 months -> yellow (<=84)
    value, color = debt_payoff_runway_months(make_inputs())
    assert value == 50.0
    assert color == "yellow"


def test_debt_payoff_runway_no_progress_returns_none():
    value, color = debt_payoff_runway_months(make_inputs(liability_reduction_trailing_6mo=Decimal("0")))
    assert value is None
    assert color == "red"


def test_total_debt_value_is_informational():
    value, color = total_debt_value(make_inputs())
    assert value == 50000.0
    assert color == "neutral"


def test_total_non_property_debt_value_excludes_property_liabilities():
    inputs = make_inputs(property_liability_value=Decimal("30000"))
    value, color = total_non_property_debt_value(inputs)
    assert value == 20000.0
    assert color == "neutral"


def test_net_cash_flow_positive_and_negative():
    # Average monthly income (30000/3=10000) - average monthly expense (24000/3=8000) = 2000/mo.
    value, color = net_cash_flow(make_inputs())
    assert value == 2000.0
    assert color == "green"

    value2, color2 = net_cash_flow(make_inputs(trailing_expense=Decimal("40000")))
    assert value2 == pytest.approx(10000.0 - 40000 / 3)
    assert color2 == "coral"


def test_discretionary_spending_rate():
    # wants 6000 / income 30000 = 20% -> green (<30)
    value, color = discretionary_spending_rate(make_inputs(wants_expense_trailing=Decimal("6000")))
    assert value == 20.0
    assert color == "green"


def test_discretionary_spending_rate_unclassified_returns_none():
    value, color = discretionary_spending_rate(make_inputs())
    assert value is None
    assert color == "yellow"


def test_net_income_rate():
    # gross over window = 120000/12*3=30000; trailing_income=30000 -> 100% -> green
    value, color = net_income_rate(make_inputs())
    assert value == 100.0
    assert color == "green"

    low = make_inputs(trailing_income=Decimal("12000"))
    value2, color2 = net_income_rate(low)
    assert value2 == 40.0
    assert color2 == "red"


def test_income_growth_rate_no_history_returns_none():
    value, color = income_growth_rate(make_inputs())
    assert value is None
    assert color == "yellow"


def test_income_growth_rate_above_and_below_pace():
    # Trailing 12mo avg $5,500/mo vs the prior 12mo avg $5,000/mo -> +10% year-over-year.
    above = make_inputs(trailing_12mo_avg_income=Decimal("5500"), prior_12mo_avg_income=Decimal("5000"))
    value, color = income_growth_rate(above)
    assert value == 10.0
    assert color == "green"

    # Trailing 12mo avg $4,000/mo vs the prior 12mo avg $5,000/mo -> -20% year-over-year.
    below = make_inputs(trailing_12mo_avg_income=Decimal("4000"), prior_12mo_avg_income=Decimal("5000"))
    value2, color2 = income_growth_rate(below)
    assert value2 == -20.0
    assert color2 == "red"


def test_debt_to_assets_ratio():
    # 50000 liabilities / 150000 assets = 33.33% -> yellow (between 30 and 50)
    value, color = debt_to_assets_ratio(make_inputs())
    assert round(value, 2) == 33.33
    assert color == "yellow"


def test_debt_to_assets_ratio_no_assets_no_debt():
    value, color = debt_to_assets_ratio(make_inputs(total_assets=Decimal("0"), total_liabilities=Decimal("0")))
    assert value == 0.0
    assert color == "green"


def test_housing_debt_to_equity():
    # equity = 500000-250000=250000; ratio=250000/250000*100=100% -> yellow (not <100, not >=300)
    inputs = make_inputs(property_asset_value=Decimal("500000"), property_liability_value=Decimal("250000"))
    value, color = housing_debt_to_equity(inputs)
    assert value == 100.0
    assert color == "yellow"


def test_housing_debt_to_equity_no_property_is_neutral():
    value, color = housing_debt_to_equity(make_inputs())
    assert value is None
    assert color == "neutral"


def test_housing_debt_to_equity_liability_without_asset_is_flagged():
    inputs = make_inputs(property_liability_value=Decimal("100000"))
    value, color = housing_debt_to_equity(inputs)
    assert value is None
    assert color == "red"


def test_housing_debt_to_equity_underwater_is_flagged():
    inputs = make_inputs(property_asset_value=Decimal("200000"), property_liability_value=Decimal("250000"))
    value, color = housing_debt_to_equity(inputs)
    assert value is None
    assert color == "red"


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


def test_future_investment_balance_missing_assumptions_returns_none():
    value, color = future_investment_balance(make_inputs())
    assert value is None
    assert color == "neutral"


def test_future_investment_balance_compounds_with_contributions():
    # age 64 -> retirement 65 = 12 months; 12% annual (1%/mo); starting 10000, +100/mo
    inputs = make_inputs(
        investment_asset_value=Decimal("10000"),
        settings={
            **DEFAULT_SETTINGS,
            "household_age": 64,
            "target_retirement_age": 65,
            "expected_return_rate": 0.12,
            "monthly_investment_contribution": 100,
        },
    )
    value, color = future_investment_balance(inputs)
    assert round(value, 2) == 12536.50
    assert color == "neutral"


def test_future_investment_balance_grows_with_higher_contribution():
    base_settings = {
        **DEFAULT_SETTINGS,
        "household_age": 64,
        "target_retirement_age": 65,
        "expected_return_rate": 0.12,
        "monthly_investment_contribution": 100,
    }
    low, _ = future_investment_balance(
        make_inputs(investment_asset_value=Decimal("10000"), settings=base_settings)
    )
    high, _ = future_investment_balance(
        make_inputs(
            investment_asset_value=Decimal("10000"),
            settings={**base_settings, "monthly_investment_contribution": 200},
        )
    )
    assert high > low


def test_future_retirement_balance_uses_retirement_contribution_key():
    inputs = make_inputs(
        retirement_asset_value=Decimal("10000"),
        settings={
            **DEFAULT_SETTINGS,
            "household_age": 64,
            "target_retirement_age": 65,
            "expected_return_rate": 0.12,
            "monthly_retirement_contribution": 100,
        },
    )
    value, color = future_retirement_balance(inputs)
    assert round(value, 2) == 12536.50
    assert color == "neutral"


def test_liquid_runway_months_falls_back_to_overall_expense_when_no_expense_at_all():
    value, color = liquid_runway_months(make_inputs(trailing_expense=Decimal("0")))
    assert value is None
    assert color == "yellow"


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


def test_needs_and_wants_ratios_on_target():
    inputs = make_inputs(
        trailing_income=Decimal("10000"),
        needs_expense_trailing=Decimal("5000"),
        wants_expense_trailing=Decimal("3000"),
    )
    needs_val, needs_color = needs_ratio(inputs)
    wants_val, wants_color = wants_ratio(inputs)
    assert needs_val == 50.0 and needs_color == "green"
    assert wants_val == 30.0 and wants_color == "green"


def test_needs_ratio_far_off_target_is_red():
    inputs = make_inputs(trailing_income=Decimal("10000"), needs_expense_trailing=Decimal("8500"))
    value, color = needs_ratio(inputs)
    assert value == 85.0
    assert color == "red"
