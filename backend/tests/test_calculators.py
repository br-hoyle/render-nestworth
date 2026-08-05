from datetime import date
from decimal import Decimal

from app.services.calculators import (
    compound_growth,
    debt_acceleration,
    debt_consolidation,
    debt_payoff,
    emergency_fund,
    financial_independence,
    house_affordability,
    interest_rate_solver,
    loan,
    mortgage,
    rebalancing,
    refinance,
    retirement,
    roth_ira,
    simple_interest,
    target_emergency_fund,
    traditional_ira,
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


# --- Backlog pass 2 additions ---


def test_loan_matches_mortgage_payment_formula():
    # Same $200k/6%/30yr reference point as the mortgage test above.
    result = loan.compute(Decimal("200000"), Decimal("0.06"), 30)
    assert abs(result["monthly_payment"] - Decimal("1199.10")) < Decimal("0.05")
    assert result["total_paid"] > Decimal("200000")
    assert result["yearly_schedule"][-1]["balance"] == Decimal("0.00")


def test_refinance_lower_rate_saves_money():
    result = refinance.compute(
        current_balance=Decimal("300000"),
        current_rate=Decimal("0.07"),
        current_remaining_years=25,
        new_rate=Decimal("0.05"),
        new_term_years=25,
        closing_costs=Decimal("5000"),
    )
    assert result["monthly_savings"] > 0
    assert result["breakeven_months"] is not None and result["breakeven_months"] > 0
    assert result["lifetime_interest_saved"] > 0


def test_interest_rate_solver_recovers_known_rate():
    # Build a payment at a known 6% rate, then confirm the solver recovers ~6%.
    known_payment = mortgage.monthly_payment(Decimal("200000"), Decimal("0.06"), 30)
    result = interest_rate_solver.compute(Decimal("200000"), known_payment, 30)
    assert abs(result["annual_rate_pct"] - 6.0) < 0.05


def test_interest_rate_solver_payment_too_low_returns_error():
    result = interest_rate_solver.compute(Decimal("200000"), Decimal("100"), 30)
    assert result["error"] is not None
    assert result["annual_rate_pct"] is None


def test_roth_ira_caps_contribution_at_annual_limit():
    result = roth_ira.compute(Decimal("0"), Decimal("50000"), 1, Decimal("0.07"))
    assert result["contribution_capped"] is True
    assert result["total_contributions"] == roth_ira.ANNUAL_LIMIT


def test_traditional_ira_growth_matches_roth_math():
    result = traditional_ira.compute(Decimal("10000"), Decimal("7000"), 10, Decimal("0.07"))
    assert result["final_balance"] > result["total_contributions"] + Decimal("10000")


def test_simple_interest_no_compounding():
    result = simple_interest.compute(Decimal("1000"), Decimal("0.05"), Decimal("2"))
    assert result["interest"] == Decimal("100.00")
    assert result["total"] == Decimal("1100.00")


def test_debt_consolidation_blended_rate():
    result = debt_consolidation.compute(
        debts=[
            {"balance": "10000", "annual_rate": "0.20", "monthly_payment": "300"},
            {"balance": "10000", "annual_rate": "0.10", "monthly_payment": "250"},
        ],
        new_rate=Decimal("0.12"),
        new_term_years=5,
    )
    assert result["total_balance"] == Decimal("20000.00")
    assert abs(result["blended_current_rate_pct"] - 15.0) < 0.01
    assert result["current_total_monthly_payment"] == Decimal("550.00")


def test_financial_independence_already_fi():
    result = financial_independence.compute(
        current_net_worth=Decimal("2000000"),
        annual_savings=Decimal("0"),
        annual_expenses=Decimal("40000"),
        withdrawal_rate=Decimal("0.04"),
    )
    assert result["already_fi"] is True
    assert result["years_to_fi"] == 0


def test_financial_independence_projects_forward():
    result = financial_independence.compute(
        current_net_worth=Decimal("100000"),
        annual_savings=Decimal("50000"),
        annual_expenses=Decimal("40000"),
        expected_return=Decimal("0.05"),
        withdrawal_rate=Decimal("0.04"),
    )
    assert result["already_fi"] is False
    assert result["years_to_fi"] is not None
    assert result["years_to_fi"] > 0


def test_debt_acceleration_avalanche_beats_baseline():
    debts = [
        {"balance": "5000", "annual_rate": "0.22", "minimum_payment": "100"},
        {"balance": "8000", "annual_rate": "0.06", "minimum_payment": "150"},
    ]
    result = debt_acceleration.compute(debts, extra_payment=Decimal("200"))
    assert result["months_saved_avalanche"] > 0
    assert result["months_saved_snowball"] > 0
    # Avalanche (highest rate first) should never accrue more interest than snowball here,
    # since the high-rate debt is also the smaller balance in this example.
    assert result["avalanche_total_interest"] <= result["snowball_total_interest"]


def test_target_emergency_fund_already_met():
    result = target_emergency_fund.compute(
        current_liquid_balance=Decimal("30000"),
        monthly_expense=Decimal("4000"),
        target_months=Decimal("6"),
        months_to_reach_goal=12,
    )
    assert result["already_met"] is True
    assert result["required_monthly_contribution"] == Decimal(0)


def test_target_emergency_fund_required_contribution():
    result = target_emergency_fund.compute(
        current_liquid_balance=Decimal("0"),
        monthly_expense=Decimal("2000"),
        target_months=Decimal("6"),
        months_to_reach_goal=12,
    )
    assert result["target_amount"] == Decimal("12000.00")
    assert result["required_monthly_contribution"] == Decimal("1000.00")
