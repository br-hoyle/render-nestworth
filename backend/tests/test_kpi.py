from decimal import Decimal

from app.schemas.settings import DEFAULT_SETTINGS
from app.services.kpi import (
    KpiInputs,
    allocation_mix,
    debt_payoff_runway_months,
    debt_to_income,
    emergency_fund_months,
    fi_progress,
    housing_cost_ratio,
    liquidity_ratio,
    net_worth_growth_yoy,
    retirement_contribution_rate,
    savings_rate,
)


def make_inputs(**overrides) -> KpiInputs:
    defaults = dict(
        net_worth=Decimal("100000"),
        net_worth_one_year_ago=Decimal("80000"),
        total_assets=Decimal("150000"),
        total_liabilities=Decimal("50000"),
        liquid_balance=Decimal("18000"),
        cash_balance=Decimal("12000"),
        assets_by_category={"Banking": Decimal("20000"), "Investments": Decimal("80000"), "Retirement": Decimal("50000")},
        gross_annual_income=Decimal("120000"),
        trailing_income=Decimal("30000"),
        trailing_expense=Decimal("24000"),
        trailing_months=3,
        housing_expense_trailing=Decimal("7200"),
        retirement_contribution_trailing=Decimal("3000"),
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


def test_retirement_contribution_rate_from_transactions():
    # 3000 trailing over 3 months -> annualized 12000 / 120000 income = 10% -> yellow
    value, color = retirement_contribution_rate(make_inputs())
    assert value == 10.0
    assert color == "yellow"


def test_retirement_contribution_rate_manual_override():
    settings = {**DEFAULT_SETTINGS, "retirement_contribution_rate_override": 20}
    value, color = retirement_contribution_rate(make_inputs(settings=settings))
    assert value == 20.0
    assert color == "green"


def test_net_worth_growth_yoy():
    value, color = net_worth_growth_yoy(make_inputs())
    assert value == 25.0
    assert color == "green"


def test_net_worth_growth_yoy_negative():
    value, color = net_worth_growth_yoy(make_inputs(net_worth=Decimal("50000")))
    assert value == -37.5
    assert color == "coral"


def test_fi_progress():
    # annual expense = 24000/3*12 = 96000; fi number = 96000/0.04 = 2,400,000
    # progress = 100000/2400000 = 4.1666% -> red
    value, color = fi_progress(make_inputs())
    assert round(value, 2) == 4.17
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


def test_allocation_mix_percentages_sum_to_100():
    mix = allocation_mix(make_inputs())
    assert round(sum(mix.values()), 4) == 100.0
    assert mix["Investments"] > mix["Banking"]
