from datetime import date
from decimal import Decimal

from app.services.calculators import (
    compound_growth,
    debt_payoff,
    emergency_fund,
    house_affordability,
    mortgage,
    rebalancing,
    retirement,
)


def test_mortgage_monthly_payment_matches_hand_checked_value():
    # $200,000 / 6% / 30yr is a widely-cited textbook example: ~$1,199.10/mo.
    payment = mortgage.monthly_payment(Decimal("200000"), Decimal("0.06"), 30)
    assert abs(payment - Decimal("1199.10")) < Decimal("0.05")


def test_mortgage_extra_payments_reduce_interest_and_term():
    baseline = mortgage.compute(Decimal("200000"), Decimal("0.06"), 30, date(2024, 1, 1))
    with_extra = mortgage.compute(
        Decimal("200000"), Decimal("0.06"), 30, date(2024, 1, 1), extra_monthly=Decimal("200")
    )
    assert with_extra["total_interest"] < baseline["total_interest"]
    assert with_extra["interest_saved"] > 0
    assert with_extra["months_saved"] > 0


def test_debt_payoff_zero_interest_is_exact():
    result = debt_payoff.compute(Decimal("1200"), Decimal("0"), Decimal("100"))
    assert result["payoff_months"] == 12
    assert result["total_interest"] == Decimal("0.00")


def test_debt_payoff_payment_never_covers_interest():
    result = debt_payoff.compute(Decimal("10000"), Decimal("0.24"), Decimal("50"))
    assert result["error"] is not None
    assert result["payoff_months"] is None


def test_compound_growth_matches_hand_checked_value():
    # $1000 at 1%/mo (12% APR) for 12 months, no contributions -> 1000*(1.01)^12
    result = compound_growth.compute(Decimal("1000"), Decimal("0"), Decimal("0.12"), 1)
    expected = Decimal("1000") * (Decimal("1.01") ** 12)
    assert abs(result["final_balance"] - round(expected, 2)) < Decimal("0.5")


def test_emergency_fund_basic():
    result = emergency_fund.compute(Decimal("18000"), Decimal("6000"), Decimal("6"))
    assert result["months_covered"] == Decimal("3.00")
    assert result["shortfall"] == Decimal("18000.00")


def test_emergency_fund_no_shortfall_when_target_met():
    result = emergency_fund.compute(Decimal("40000"), Decimal("6000"), Decimal("6"))
    assert result["shortfall"] == Decimal("0.00")


def test_house_affordability_back_end_binding():
    result = house_affordability.compute(
        gross_monthly_income=Decimal("10000"),
        monthly_debts=Decimal("500"),
        down_payment_pct=Decimal("0.20"),
        annual_rate=Decimal("0.065"),
        term_years=30,
        tax_ins_hoa_monthly=Decimal("400"),
    )
    assert result["max_price"] > 0
    assert result["back_end_dti"] <= Decimal("36.1")


def test_retirement_depletes_at_expected_age_with_zero_return():
    result = retirement.compute(
        current_age=60,
        retirement_age=61,
        life_expectancy=65,
        current_balance=Decimal("100000"),
        monthly_contribution=Decimal("0"),
        real_return_rate=Decimal("0"),
        withdrawal_rate=Decimal("0.25"),
    )
    assert result["balance_at_retirement"] == Decimal("100000.00")
    assert result["depletion_age"] == 65
    assert result["lasts_past_life_expectancy"] is False


def test_retirement_lasts_past_life_expectancy_with_low_withdrawal():
    result = retirement.compute(
        current_age=50,
        retirement_age=65,
        life_expectancy=90,
        current_balance=Decimal("500000"),
        monthly_contribution=Decimal("1000"),
        real_return_rate=Decimal("0.05"),
        withdrawal_rate=Decimal("0.03"),
    )
    assert result["depletion_age"] is None
    assert result["lasts_past_life_expectancy"] is True


def test_rebalancing_trades_move_toward_target():
    trades = rebalancing.compute(
        current_allocation={"stocks": Decimal("80000"), "bonds": Decimal("20000")},
        target_allocation_pct={"stocks": Decimal("60"), "bonds": Decimal("40")},
    )
    assert trades["trades"]["stocks"] < 0  # sell stocks
    assert trades["trades"]["bonds"] > 0  # buy bonds
