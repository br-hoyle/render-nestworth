from datetime import date
from decimal import Decimal

from app.services.calculators import (
    _amortization,
    amortization,
    compound_interest_converter,
    debt_consolidation,
    debt_payoff_avalanche,
    financial_independence,
    house_affordability,
    interest_rate_solver,
    investment,
    k401,
    k401_match_maximizer,
    loan_calculator,
    mortgage,
    mortgage_payoff,
    refinance,
    rent_vs_buy,
    repayment_calculator,
    retirement_longevity,
    retirement_need,
    retirement_projection,
    retirement_savings_plan,
    retirement_withdrawal,
    roth_ira,
    savings,
    simple_interest,
)


def test_mortgage_monthly_payment_matches_hand_checked_value():
    # $200,000 / 6% / 30yr is a widely-cited textbook example: ~$1,199.10/mo.
    payment = mortgage.monthly_payment(Decimal("200000"), Decimal("0.06"), 30)
    assert abs(payment - Decimal("1199.10")) < Decimal("0.05")


def test_mortgage_full_piti_and_pmi_threshold():
    # 20% down should skip PMI entirely; under 20% should include it.
    with_20pct_down = mortgage.compute(
        home_price=Decimal("400000"),
        down_payment_value=Decimal("0.20"),
        down_payment_is_percent=True,
        annual_rate=Decimal("0.06"),
        term_years=30,
        start_date=date(2024, 1, 1),
        property_tax_value=Decimal("0.012"),
        property_tax_is_percent=True,
        pmi_value=Decimal("0.006"),
        pmi_is_percent=True,
    )
    assert with_20pct_down["monthly_escrow"]["pmi"] == Decimal("0.00")
    assert with_20pct_down["loan_amount"] == Decimal("320000.00")
    assert with_20pct_down["total_monthly_payment"] > with_20pct_down["monthly_pi"]

    with_10pct_down = mortgage.compute(
        home_price=Decimal("400000"),
        down_payment_value=Decimal("0.10"),
        down_payment_is_percent=True,
        annual_rate=Decimal("0.06"),
        term_years=30,
        start_date=date(2024, 1, 1),
        pmi_value=Decimal("0.006"),
        pmi_is_percent=True,
    )
    assert with_10pct_down["monthly_escrow"]["pmi"] > Decimal("0.00")


def test_mortgage_down_payment_as_flat_amount():
    result = mortgage.compute(
        home_price=Decimal("400000"),
        down_payment_value=Decimal("80000"),
        down_payment_is_percent=False,
        annual_rate=Decimal("0.06"),
        term_years=30,
        start_date=date(2024, 1, 1),
    )
    assert result["loan_amount"] == Decimal("320000.00")


def test_amortization_matches_mortgage_payment_formula():
    # Same $200k/6%/30yr reference point as the mortgage-payment test above; the Amortization
    # Calculator's plain (no extras) case should reduce to the same amortization math.
    result = amortization.compute(Decimal("200000"), Decimal("0.06"), 30, start_date=date(2024, 1, 1))
    assert abs(result["monthly_payment"] - Decimal("1199.10")) < Decimal("0.05")
    assert result["total_paid"] > Decimal("200000")
    assert result["yearly_schedule"][-1]["balance"] == Decimal("0.00")
    assert result["payoff_date"] is not None


def test_amortization_extra_payments_reduce_interest_and_term():
    baseline = amortization.compute(Decimal("200000"), Decimal("0.06"), 30, start_date=date(2024, 1, 1))
    with_extra = amortization.compute(
        Decimal("200000"), Decimal("0.06"), 30, start_date=date(2024, 1, 1), extra_monthly=Decimal("200")
    )
    assert with_extra["total_interest"] < baseline["total_interest"]
    assert with_extra["interest_saved"] > 0
    assert with_extra["months_saved"] > 0


def test_amortization_combines_all_three_extra_payment_types():
    only_monthly = amortization.compute(
        Decimal("200000"), Decimal("0.06"), 30, start_date=date(2024, 1, 1), extra_monthly=Decimal("100")
    )
    all_three = amortization.compute(
        Decimal("200000"),
        Decimal("0.06"),
        30,
        start_date=date(2024, 1, 1),
        extra_monthly=Decimal("100"),
        extra_yearly=Decimal("1000"),
        extra_yearly_start_date=date(2025, 1, 1),
        extra_one_time=Decimal("5000"),
        extra_one_time_date=date(2024, 7, 1),
    )
    assert all_three["total_interest"] < only_monthly["total_interest"]


def test_mortgage_payoff_biweekly_beats_extra_payments_baseline():
    biweekly = mortgage_payoff.compute(
        original_principal=Decimal("300000"),
        original_term_years=30,
        annual_rate=Decimal("0.06"),
        start_date=date(2019, 1, 1),
        remaining_term_years=25,
        remaining_term_months=0,
        repayment_option="biweekly",
    )
    assert biweekly["interest_saved"] > 0
    assert biweekly["months_saved"] > 0
    assert biweekly["payoff_date"] is not None


def test_mortgage_payoff_extra_payments_beats_baseline():
    with_extra = mortgage_payoff.compute(
        original_principal=Decimal("300000"),
        original_term_years=30,
        annual_rate=Decimal("0.06"),
        start_date=date(2019, 1, 1),
        remaining_term_years=25,
        remaining_term_months=0,
        repayment_option="extra_payments",
        extra_monthly=Decimal("300"),
    )
    assert with_extra["interest_saved"] > 0
    assert with_extra["months_saved"] > 0


def test_mortgage_payoff_biweekly_extra_biweekly_beats_plain_biweekly():
    plain = mortgage_payoff.compute(
        original_principal=Decimal("300000"),
        original_term_years=30,
        annual_rate=Decimal("0.06"),
        start_date=date(2019, 1, 1),
        remaining_term_years=25,
        remaining_term_months=0,
        repayment_option="biweekly",
    )
    with_extra = mortgage_payoff.compute(
        original_principal=Decimal("300000"),
        original_term_years=30,
        annual_rate=Decimal("0.06"),
        start_date=date(2019, 1, 1),
        remaining_term_years=25,
        remaining_term_months=0,
        repayment_option="biweekly",
        extra_biweekly=Decimal("50"),
    )
    assert with_extra["total_interest"] < plain["total_interest"]


def test_amortize_engine_no_payoff_within_cap_returns_none():
    # A payment that doesn't even cover interest should never reach zero.
    result = _amortization.amortize(Decimal("100000"), Decimal("0.10"), payment=Decimal("100"), payments_per_year=12)
    assert result["periods_to_payoff"] is None


def test_house_affordability_income_to_debt_back_end_binding():
    result = house_affordability.compute(
        mode="income-to-debt",
        annual_income=Decimal("120000"),
        monthly_debts=Decimal("500"),
        down_payment_value=Decimal("0.20"),
        down_payment_is_percent=True,
        annual_rate=Decimal("0.065"),
        term_years=30,
        hoa_fees_value=Decimal("400"),
        hoa_fees_is_percent=False,
        dti_preset="conventional",
    )
    assert result["max_price"] > 0
    assert result["back_end_dti"] <= Decimal("36.1")
    assert result["monthly_escrow"]["pmi"] == Decimal("0.00")  # 20% down clears the PMI threshold


def test_house_affordability_income_to_debt_applies_pmi_under_20pct_down():
    result = house_affordability.compute(
        mode="income-to-debt",
        annual_income=Decimal("120000"),
        monthly_debts=Decimal("500"),
        down_payment_value=Decimal("0.10"),
        down_payment_is_percent=True,
        pmi_value=Decimal("0.006"),
        pmi_is_percent=True,
        dti_preset="conventional",
    )
    assert result["monthly_escrow"]["pmi"] > Decimal("0.00")


def test_house_affordability_dti_presets_change_max_price():
    conventional = house_affordability.compute(
        mode="income-to-debt", annual_income=Decimal("120000"), monthly_debts=Decimal("500"), dti_preset="conventional"
    )
    fha = house_affordability.compute(
        mode="income-to-debt", annual_income=Decimal("120000"), monthly_debts=Decimal("500"), dti_preset="fha"
    )
    # FHA's looser back-end ratio (43% vs 36%) should afford a higher price.
    assert fha["max_price"] > conventional["max_price"]


def test_house_affordability_fixed_budget_mode():
    result = house_affordability.compute(
        mode="fixed-budget",
        monthly_budget=Decimal("2500"),
        term_years=30,
        annual_rate=Decimal("0.065"),
        down_payment_value=Decimal("0.20"),
        down_payment_is_percent=True,
        other_costs_value=Decimal("100"),
        other_costs_is_percent=False,
    )
    assert result["max_price"] > 0
    assert result["monthly_piti"] <= Decimal("2500.01")


# --- Backlog pass 2 additions ---


def test_refinance_lower_rate_saves_money():
    current_payment = mortgage.monthly_payment(Decimal("300000"), Decimal("0.07"), 25)
    result = refinance.compute(
        current_balance=Decimal("300000"),
        current_monthly_payment=current_payment,
        current_rate=Decimal("0.07"),
        new_rate=Decimal("0.05"),
        new_term_years=25,
        new_loan_costs_fees=Decimal("5000"),
    )
    assert result["monthly_savings"] > 0
    assert result["breakeven_months"] is not None and result["breakeven_months"] > 0
    assert result["lifetime_interest_saved"] > 0


def test_refinance_points_and_cash_out_affect_upfront_cost_and_balance():
    current_payment = mortgage.monthly_payment(Decimal("300000"), Decimal("0.07"), 25)
    result = refinance.compute(
        current_balance=Decimal("300000"),
        current_monthly_payment=current_payment,
        current_rate=Decimal("0.07"),
        new_rate=Decimal("0.05"),
        new_term_years=25,
        new_loan_points=Decimal("0.01"),
        cash_out_amount=Decimal("20000"),
    )
    assert result["new_loan_amount"] == Decimal("320000.00")
    assert result["upfront_costs"] > 0
    assert result["net_upfront_cost"] < result["upfront_costs"]  # cash out offsets the upfront cost


def test_refinance_payment_too_low_returns_error():
    result = refinance.compute(
        current_balance=Decimal("300000"),
        current_monthly_payment=Decimal("100"),
        current_rate=Decimal("0.07"),
        new_rate=Decimal("0.05"),
        new_term_years=25,
    )
    assert "error" in result


def test_interest_rate_solver_recovers_known_rate():
    # Build a payment at a known 6% rate, then confirm the solver recovers ~6%.
    known_payment = mortgage.monthly_payment(Decimal("200000"), Decimal("0.06"), 30)
    result = interest_rate_solver.compute(Decimal("200000"), known_payment, 30)
    assert abs(result["annual_rate_pct"] - 6.0) < 0.05


def test_interest_rate_solver_payment_too_low_returns_error():
    result = interest_rate_solver.compute(Decimal("200000"), Decimal("100"), 30)
    assert result["error"] is not None
    assert result["annual_rate_pct"] is None


def test_interest_rate_solver_accepts_years_and_months():
    # 30 years flat vs. 29y11m should land at essentially the same implied rate.
    known_payment = mortgage.monthly_payment(Decimal("200000"), Decimal("0.06"), 30)
    result = interest_rate_solver.compute(Decimal("200000"), known_payment, term_years=29, term_months=11)
    assert abs(result["annual_rate_pct"] - 6.0) < 0.1


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


# --- Retirement & Investment redesign ---


def test_retirement_need_shortfall_requires_more_savings():
    result = retirement_need.compute(
        current_age=40,
        retirement_age=65,
        current_income=Decimal("80000"),
        current_savings=Decimal("10000"),
        avg_return=Decimal("0.06"),
        inflation_rate=Decimal("0.03"),
    )
    assert result["required_balance"] > 0
    assert result["on_track"] is False
    assert result["required_additional_monthly_savings"] > 0


def test_retirement_need_surplus_when_savings_are_ample():
    result = retirement_need.compute(
        current_age=64,
        retirement_age=65,
        current_income=Decimal("50000"),
        current_savings=Decimal("5000000"),
    )
    assert result["on_track"] is True
    assert result["required_additional_monthly_savings"] == Decimal(0)


def test_retirement_savings_plan_solves_required_contribution():
    result = retirement_savings_plan.compute(
        current_age=40,
        retirement_age=65,
        amount_needed_at_retirement=Decimal("1000000"),
        current_retirement_savings=Decimal("0"),
        avg_investment_return=Decimal("0.06"),
    )
    assert result["required_monthly_contribution"] > 0
    # Reinvest the solved contribution and confirm it actually reaches the target.
    final_balance = result["schedule"][-1]["balance"]
    assert abs(final_balance - Decimal("1000000")) < Decimal("50")


def test_retirement_savings_plan_already_on_track():
    result = retirement_savings_plan.compute(
        current_age=64,
        retirement_age=65,
        amount_needed_at_retirement=Decimal("100000"),
        current_retirement_savings=Decimal("500000"),
    )
    assert result["already_on_track"] is True
    assert result["required_monthly_contribution"] == Decimal(0)


def test_retirement_projection_compounds_savings_and_contributions():
    result = retirement_projection.compute(
        current_age=35,
        retirement_age=65,
        current_retirement_savings=Decimal("20000"),
        monthly_contribution=Decimal("500"),
        avg_investment_return=Decimal("0.10"),
    )
    assert result["total_contributions"] == Decimal("180000.00")
    assert result["balance_at_retirement"] > result["total_contributions"] + Decimal("20000")
    final_point = result["schedule"][-1]
    assert final_point["age"] == 65
    assert final_point["balance"] == result["balance_at_retirement"]


def test_retirement_projection_requires_retirement_after_current_age():
    result = retirement_projection.compute(current_age=65, retirement_age=65)
    assert "error" in result


def test_retirement_withdrawal_depletes_by_life_expectancy():
    result = retirement_withdrawal.compute(
        current_age=60,
        retirement_age=65,
        life_expectancy=90,
        current_retirement_savings=Decimal("500000"),
        monthly_contribution=Decimal("500"),
        avg_investment_return=Decimal("0.06"),
        inflation_rate=Decimal("0.03"),
    )
    assert result["sustainable_monthly_withdrawal"] > 0
    final_point = result["schedule"][-1]
    assert final_point["phase"] == "drawdown"
    assert final_point["balance"] < Decimal("10")


def test_retirement_longevity_depletes_at_high_withdrawal():
    result = retirement_longevity.compute(
        retirement_savings_at_retirement=Decimal("100000"),
        planned_withdrawal_amount=Decimal("5000"),
        avg_investment_return=Decimal("0.05"),
    )
    assert result["lasts_indefinitely"] is False
    assert result["months_lasted"] is not None
    assert result["months_lasted"] > 0


def test_retirement_longevity_lasts_indefinitely_at_low_withdrawal():
    result = retirement_longevity.compute(
        retirement_savings_at_retirement=Decimal("1000000"),
        planned_withdrawal_amount=Decimal("1000"),
        avg_investment_return=Decimal("0.06"),
    )
    assert result["lasts_indefinitely"] is True
    assert result["months_lasted"] is None
    assert result["balance_at_life_expectancy"] > 0


def test_retirement_longevity_reports_depletion_age_and_shortfall():
    result = retirement_longevity.compute(
        retirement_savings_at_retirement=Decimal("100000"),
        planned_withdrawal_amount=Decimal("5000"),
        avg_investment_return=Decimal("0.05"),
        retirement_age=65,
        life_expectancy=90,
    )
    assert result["depletion_age"] is not None
    assert result["depletion_age"] < 90
    assert result["years_before_after_life_expectancy"] < 0
    assert result["balance_at_life_expectancy"] < 0  # withdrawals continue past depletion, unclamped


def test_investment_end_amount_matches_hand_checked_value():
    # $1000 at 1%/mo (12% APR) for 12 months, no contributions -> 1000*(1.01)^12.
    result = investment.compute(
        current_savings=Decimal("1000"),
        annual_rate=Decimal("0.12"),
        compound_frequency="monthly",
        contribution_timing="end",
        solve_for="end_amount",
        term_years=1,
        contribution_amount=Decimal("0"),
    )
    expected = Decimal("1000") * (Decimal("1.01") ** 12)
    assert abs(result["end_amount"] - round(expected, 2)) < Decimal("0.5")


def test_investment_contribution_mode_solves_and_hits_target():
    result = investment.compute(
        current_savings=Decimal("0"),
        annual_rate=Decimal("0.07"),
        compound_frequency="monthly",
        contribution_timing="end",
        solve_for="contribution",
        term_years=20,
        target_end_amount=Decimal("500000"),
    )
    assert result["required_contribution"] > 0
    assert abs(result["schedule"][-1]["balance"] - Decimal("500000")) < Decimal("50")


def test_investment_length_mode_solves_and_hits_target():
    result = investment.compute(
        current_savings=Decimal("10000"),
        annual_rate=Decimal("0.07"),
        compound_frequency="monthly",
        contribution_timing="end",
        solve_for="length",
        contribution_amount=Decimal("500"),
        target_end_amount=Decimal("100000"),
    )
    assert result["periods_needed"] > 0
    assert result["schedule"][-1]["balance"] >= Decimal("100000")


def test_k401_projects_balance_and_sustainable_income():
    result = k401.compute(
        current_age=30,
        annual_income=Decimal("80000"),
        retirement_age=65,
        current_balance=Decimal("10000"),
        contribution_pct=Decimal("0.06"),
        employer_match_pct=Decimal("0.50"),
        employer_match_limit_pct=Decimal("0.06"),
    )
    assert result["balance_at_retirement"] > 0
    assert result["total_employer_match"] > 0
    assert result["sustainable_monthly_income"] > 0


def test_k401_match_maximizer_recommends_cumulative_window():
    result = k401_match_maximizer.compute(
        current_age=35,
        annual_income=Decimal("100000"),
        employer_match_1_pct=Decimal("1.00"),
        employer_match_1_limit_pct=Decimal("0.03"),
        employer_match_2_pct=Decimal("0.50"),
        employer_match_2_limit_pct=Decimal("0.02"),
    )
    assert result["recommended_min_pct"] == 5.0
    assert result["meets_full_match_within_irs_limit"] is True
    assert result["estimated_annual_employer_match"] > 0


def test_roth_ira_beats_taxable_equivalent():
    result = roth_ira.compute(
        current_age=30,
        retirement_age=50,
        current_balance=Decimal("0"),
        maximize_contributions=True,
        avg_return=Decimal("0.07"),
        marginal_tax_rate=Decimal("0.22"),
    )
    assert result["roth_balance"] > result["taxable_balance"]
    assert result["roth_advantage"] > 0
    assert result["total_contributions"] == roth_ira.ANNUAL_LIMIT * 20


def test_compound_interest_converter_monthly_beats_annual_nominal():
    result = compound_interest_converter.compute(
        input_rate=Decimal("0.05"),
        input_compound_frequency="monthly",
        output_compound_frequency="annually",
    )
    # Converting "5% compounded monthly" to an equivalent annually-compounded nominal rate
    # should read slightly ABOVE 5%, since monthly compounding earns more per stated rate.
    assert result["output_nominal_rate_pct"] > 5.0
    assert len(result["comparison_table"]) >= 6


def test_savings_applies_tax_to_interest():
    no_tax = savings.compute(
        starting_balance=Decimal("10000"),
        interest_rate=Decimal("0.05"),
        term_years=5,
        compound_frequency="annually",
        tax_rate=Decimal("0"),
    )
    taxed = savings.compute(
        starting_balance=Decimal("10000"),
        interest_rate=Decimal("0.05"),
        term_years=5,
        compound_frequency="annually",
        tax_rate=Decimal("0.25"),
    )
    assert taxed["final_balance"] < no_tax["final_balance"]
    assert taxed["total_tax_paid"] > 0


def test_savings_escalating_contributions_increase_total():
    flat = savings.compute(
        starting_balance=Decimal("0"),
        interest_rate=Decimal("0.03"),
        term_years=10,
        monthly_contribution=Decimal("200"),
    )
    escalating = savings.compute(
        starting_balance=Decimal("0"),
        interest_rate=Decimal("0.03"),
        term_years=10,
        monthly_contribution=Decimal("200"),
        monthly_contribution_increase_pct=Decimal("0.03"),
    )
    assert escalating["total_contributions"] > flat["total_contributions"]


# --- Debt & Payment redesign ---


def test_loan_calculator_amortized_matches_mortgage_payment_formula():
    # Same $200k/6%/30yr reference point as the mortgage test above — monthly compound and
    # monthly payback frequencies should reduce to the exact same formula.
    result = loan_calculator.compute(
        loan_type="amortized",
        principal=Decimal("200000"),
        annual_rate=Decimal("0.06"),
        term_years=30,
        compound_frequency="monthly",
        payback_frequency="monthly",
    )
    assert abs(result["payment_per_period"] - Decimal("1199.10")) < Decimal("0.05")
    assert result["yearly_schedule"][-1]["balance"] == Decimal("0.00")


def test_loan_calculator_deferred_accrues_to_maturity():
    result = loan_calculator.compute(
        loan_type="deferred",
        principal=Decimal("10000"),
        annual_rate=Decimal("0.05"),
        term_years=5,
        compound_frequency="annually",
    )
    expected = Decimal("10000") * (Decimal("1.05") ** 5)
    assert abs(result["amount_due_at_maturity"] - round(expected, 2)) < Decimal("0.5")


def test_loan_calculator_bond_is_inverse_of_deferred():
    # A bond's initial value, grown forward at the same rate/term, should recover the face value.
    bond = loan_calculator.compute(
        loan_type="bond",
        principal=Decimal("10000"),
        annual_rate=Decimal("0.05"),
        term_years=5,
        compound_frequency="annually",
    )
    grown = bond["initial_value"] * (Decimal("1.05") ** 5)
    assert abs(grown - Decimal("10000")) < Decimal("0.5")


def test_repayment_calculator_fixed_time_matches_fixed_installment():
    fixed_time = repayment_calculator.compute(
        balance=Decimal("20000"), annual_rate=Decimal("0.08"), mode="fixed_time", term_years=5
    )
    fixed_installment = repayment_calculator.compute(
        balance=Decimal("20000"),
        annual_rate=Decimal("0.08"),
        mode="fixed_installment",
        installment_amount=fixed_time["payment_per_period"],
    )
    assert abs(fixed_installment["periods_to_payoff"] - 60) <= 1


def test_repayment_calculator_handles_compound_payback_mismatch():
    # Compounded monthly but paid biweekly — should still produce a sane positive payment.
    result = repayment_calculator.compute(
        balance=Decimal("15000"),
        annual_rate=Decimal("0.09"),
        mode="fixed_time",
        compound_frequency="monthly",
        payback_frequency="biweekly",
        term_years=3,
    )
    assert result["payment_per_period"] > 0
    assert result["total_interest"] > 0


def test_debt_payoff_avalanche_prioritizes_highest_rate():
    debts = [
        {"name": "Card A", "balance": "5000", "annual_rate": "0.22", "minimum_payment": "100"},
        {"name": "Card B", "balance": "8000", "annual_rate": "0.06", "minimum_payment": "150"},
    ]
    result = debt_payoff_avalanche.compute(debts, extra_payment=Decimal("200"))
    assert result["payoff_order"][0] == "Card A"
    assert result["months_to_payoff"] is not None
    assert result["total_interest"] > 0


def test_debt_payoff_avalanche_fixed_total_payment_pays_off_faster():
    debts = [
        {"name": "A", "balance": "3000", "annual_rate": "0.20", "minimum_payment": "100"},
        {"name": "B", "balance": "10000", "annual_rate": "0.10", "minimum_payment": "150"},
    ]
    fixed_total = debt_payoff_avalanche.compute(debts, fixed_total_payment=True)
    not_fixed = debt_payoff_avalanche.compute(debts, fixed_total_payment=False)
    assert fixed_total["months_to_payoff"] <= not_fixed["months_to_payoff"]


def test_debt_consolidation_includes_origination_fee_in_total_cost():
    result = debt_consolidation.compute(
        debts=[{"balance": "20000", "annual_rate": "0.15", "monthly_payment": "500"}],
        new_rate=Decimal("0.10"),
        new_term_years=5,
        loan_origination_fee=Decimal("500"),
    )
    assert result["new_total_cost_including_fee"] > result["new_monthly_payment"] * 60


# --- Housing & Mortgage redesign ---


def _rent_vs_buy_inputs(**overrides):
    base = dict(
        comparison_years=10,
        home_price=Decimal("400000"),
        down_payment_value=Decimal("0.20"),
        down_payment_is_percent=True,
        closing_costs_value=Decimal("0.03"),
        closing_costs_is_percent=True,
        annual_rate=Decimal("0.065"),
        loan_term_years=30,
        property_tax_pct=Decimal("0.012"),
        home_insurance_pct=Decimal("0.005"),
        pmi_pct=Decimal("0.006"),
        hoa_fees_pct=Decimal(0),
        other_costs_pct=Decimal("0.01"),
        home_appreciation_pct=Decimal("0.03"),
        selling_closing_costs_pct=Decimal("0.06"),
        monthly_rent=Decimal("2000"),
        security_deposit=Decimal("2000"),
        rent_upfront_cost=Decimal(0),
        rental_increase_pct=Decimal("0.03"),
        renters_insurance_value=Decimal("0.01"),
        renters_insurance_is_percent=True,
        avg_investment_return=Decimal("0.07"),
        marginal_federal_rate=Decimal("0.22"),
        marginal_state_rate=Decimal("0.05"),
        tax_filing_status="single",
    )
    base.update(overrides)
    return base


def test_rent_vs_buy_returns_a_recommendation_and_schedule():
    result = rent_vs_buy.compute(**_rent_vs_buy_inputs())
    assert result["recommendation"] in ("Renting", "Buying")
    assert len(result["schedule"]) == 10
    assert result["schedule"][-1]["year"] == 10
    assert result["home_value_at_horizon"] > Decimal("400000")


def test_rent_vs_buy_cheap_rent_favors_renting():
    result = rent_vs_buy.compute(**_rent_vs_buy_inputs(monthly_rent=Decimal("500")))
    assert result["recommendation"] == "Renting"
    assert result["avg_rent_cost_at_horizon"] < result["avg_buy_cost_at_horizon"]


def test_rent_vs_buy_expensive_rent_favors_buying():
    result = rent_vs_buy.compute(**_rent_vs_buy_inputs(monthly_rent=Decimal("6000")))
    assert result["recommendation"] == "Buying"
    assert result["avg_buy_cost_at_horizon"] < result["avg_rent_cost_at_horizon"]
    assert result["breakeven_year"] is not None


def test_rent_vs_buy_down_payment_cant_exceed_price():
    result = rent_vs_buy.compute(**_rent_vs_buy_inputs(down_payment_value=Decimal("1.5")))
    assert "error" in result


def test_rent_vs_buy_low_down_payment_costs_more_via_pmi():
    with_pmi = rent_vs_buy.compute(**_rent_vs_buy_inputs(down_payment_value=Decimal("0.10")))
    without_pmi = rent_vs_buy.compute(**_rent_vs_buy_inputs(down_payment_value=Decimal("0.10"), pmi_pct=Decimal(0)))
    assert with_pmi["avg_buy_cost_at_horizon"] > without_pmi["avg_buy_cost_at_horizon"]


def test_rent_vs_buy_schedule_tracks_average_costs_and_equity():
    result = rent_vs_buy.compute(**_rent_vs_buy_inputs())
    first, last = result["schedule"][0], result["schedule"][-1]
    assert last["home_equity"] > first["home_equity"]
    assert last["avg_rent_cost"] > first["avg_rent_cost"]  # rent has no equity offset, so its average only climbs


def test_rent_vs_buy_home_equity_makes_buying_cheaper_over_a_long_horizon():
    # The core fix this test guards: without netting sale proceeds against buy-side cost, buying
    # could never look cheaper long-term even though paying down a mortgage builds equity a
    # renter never gets back. Over a long-enough horizon with reasonable appreciation, buying's
    # average monthly cost should end up cheaper than renting's, and a breakeven year should exist
    # well inside the horizon.
    result = rent_vs_buy.compute(**_rent_vs_buy_inputs(comparison_years=30, loan_term_years=30))
    assert result["recommendation"] == "Buying"
    assert result["breakeven_year"] is not None
    assert result["breakeven_year"] < 30
    assert result["avg_buy_cost_at_horizon"] < result["avg_rent_cost_at_horizon"]
