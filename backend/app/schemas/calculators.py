from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

CompoundFrequency = Literal["annually", "semiannually", "quarterly", "monthly", "biweekly", "weekly", "daily"]
ExtendedCompoundFrequency = Literal[
    "annually", "semiannually", "quarterly", "monthly", "biweekly", "weekly", "daily", "continuous"
]


class InterestRateSolverInput(BaseModel):
    principal: Decimal
    target_monthly_payment: Decimal
    term_years: int = 5
    term_months: int = 0


class SimpleInterestInput(BaseModel):
    principal: Decimal
    annual_rate: Decimal = Decimal("0.05")
    years: Decimal = Decimal(1)


class ConsolidationDebtItem(BaseModel):
    balance: Decimal
    annual_rate: Decimal
    monthly_payment: Decimal = Decimal(0)


class DebtConsolidationInput(BaseModel):
    debts: list[ConsolidationDebtItem]
    new_rate: Decimal = Decimal("0.10")
    new_term_years: int = 5
    loan_origination_fee: Decimal = Decimal(0)


class FinancialIndependenceInput(BaseModel):
    current_net_worth: Decimal = Decimal(0)
    annual_savings: Decimal = Decimal(0)
    annual_expenses: Decimal
    expected_return: Decimal = Decimal("0.07")
    withdrawal_rate: Decimal = Decimal("0.04")


# --- Retirement & Investment redesign ---


class RetirementNeedInput(BaseModel):
    current_age: int
    retirement_age: int
    current_income: Decimal
    current_savings: Decimal = Decimal(0)
    life_expectancy: int = 90
    annual_income_increase: Decimal = Decimal("0.02")
    income_replacement_pct: Decimal = Decimal("0.80")
    avg_return: Decimal = Decimal("0.06")
    inflation_rate: Decimal = Decimal("0.03")
    other_income_monthly: Decimal = Decimal(0)


class RetirementSavingsPlanInput(BaseModel):
    current_age: int
    retirement_age: int
    amount_needed_at_retirement: Decimal
    current_retirement_savings: Decimal = Decimal(0)
    avg_investment_return: Decimal = Decimal("0.06")


class RetirementWithdrawalInput(BaseModel):
    current_age: int
    retirement_age: int
    current_retirement_savings: Decimal = Decimal(0)
    monthly_contribution: Decimal = Decimal(0)
    life_expectancy: int = 90
    avg_investment_return: Decimal = Decimal("0.06")
    inflation_rate: Decimal = Decimal("0.03")


class RetirementLongevityInput(BaseModel):
    retirement_savings_at_retirement: Decimal
    planned_withdrawal_amount: Decimal
    avg_investment_return: Decimal = Decimal("0.06")
    retirement_age: int = 65
    life_expectancy: int = 90


class InvestmentInput(BaseModel):
    current_savings: Decimal = Decimal(0)
    annual_rate: Decimal = Decimal("0.07")
    compound_frequency: CompoundFrequency = "monthly"
    contribution_timing: Literal["beginning", "end"] = "end"
    solve_for: Literal["end_amount", "contribution", "length"] = "end_amount"
    term_years: int | None = 10
    contribution_amount: Decimal | None = Decimal(0)
    target_end_amount: Decimal | None = None


class K401Input(BaseModel):
    current_age: int
    annual_income: Decimal
    retirement_age: int = 65
    current_balance: Decimal = Decimal(0)
    contribution_pct: Decimal = Decimal("0.06")
    employer_match_pct: Decimal = Decimal("0.50")
    employer_match_limit_pct: Decimal = Decimal("0.06")
    life_expectancy: int = 90
    annual_income_increase: Decimal = Decimal("0.02")
    avg_return: Decimal = Decimal("0.07")
    inflation_rate: Decimal = Decimal("0.03")


class K401MatchMaximizerInput(BaseModel):
    current_age: int
    annual_income: Decimal
    employer_match_1_pct: Decimal = Decimal("1.00")
    employer_match_1_limit_pct: Decimal = Decimal("0.03")
    employer_match_2_pct: Decimal = Decimal("0.50")
    employer_match_2_limit_pct: Decimal = Decimal("0.02")


class RothIraInput(BaseModel):
    current_age: int
    retirement_age: int
    current_balance: Decimal = Decimal(0)
    maximize_contributions: bool = True
    annual_contribution: Decimal = Decimal("7000")
    avg_return: Decimal = Decimal("0.07")
    marginal_tax_rate: Decimal = Decimal("0.22")


class CompoundInterestConverterInput(BaseModel):
    input_rate: Decimal
    input_compound_frequency: ExtendedCompoundFrequency = "monthly"
    output_compound_frequency: ExtendedCompoundFrequency = "annually"


class SavingsInput(BaseModel):
    starting_balance: Decimal = Decimal(0)
    interest_rate: Decimal = Decimal("0.04")
    term_years: int = 10
    annual_contribution: Decimal = Decimal(0)
    annual_contribution_increase_pct: Decimal = Decimal(0)
    monthly_contribution: Decimal = Decimal(0)
    monthly_contribution_increase_pct: Decimal = Decimal(0)
    compound_frequency: CompoundFrequency = "monthly"
    tax_rate: Decimal = Decimal(0)


# --- Debt & Payment redesign ---


class LoanCalculatorInput(BaseModel):
    loan_type: Literal["amortized", "deferred", "bond"] = "amortized"
    principal: Decimal
    annual_rate: Decimal = Decimal("0.07")
    term_years: int = 5
    compound_frequency: CompoundFrequency = "monthly"
    payback_frequency: CompoundFrequency = "monthly"


class RepaymentCalculatorInput(BaseModel):
    mode: Literal["fixed_time", "fixed_installment"] = "fixed_time"
    balance: Decimal
    annual_rate: Decimal = Decimal("0.07")
    compound_frequency: CompoundFrequency = "monthly"
    payback_frequency: CompoundFrequency = "monthly"
    term_years: int | None = 5
    term_months: int = 0
    installment_amount: Decimal | None = None


class PayoffDebtItem(BaseModel):
    name: str = ""
    balance: Decimal
    annual_rate: Decimal
    minimum_payment: Decimal


class DebtPayoffAvalancheInput(BaseModel):
    debts: list[PayoffDebtItem]
    fixed_total_payment: bool = True
    extra_payment: Decimal = Decimal(0)
    extra_payment_frequency: Literal["monthly", "annually"] = "monthly"


# --- Housing & Mortgage redesign ---


class MortgageInput(BaseModel):
    home_price: Decimal
    down_payment_value: Decimal = Decimal("0.20")
    down_payment_is_percent: bool = True
    annual_rate: Decimal = Decimal("0.065")
    term_years: int = 30
    start_date: date
    property_tax_value: Decimal = Decimal(0)
    property_tax_is_percent: bool = True
    home_insurance_value: Decimal = Decimal(0)
    home_insurance_is_percent: bool = True
    pmi_value: Decimal = Decimal(0)
    pmi_is_percent: bool = True
    hoa_fees_value: Decimal = Decimal(0)
    hoa_fees_is_percent: bool = False
    other_costs_value: Decimal = Decimal(0)
    other_costs_is_percent: bool = False


class AmortizationInput(BaseModel):
    principal: Decimal
    annual_rate: Decimal = Decimal("0.065")
    term_years: int = 30
    start_date: date
    extra_monthly: Decimal = Decimal(0)
    extra_monthly_start_date: date | None = None
    extra_yearly: Decimal = Decimal(0)
    extra_yearly_start_date: date | None = None
    extra_one_time: Decimal = Decimal(0)
    extra_one_time_date: date | None = None


class MortgagePayoffInput(BaseModel):
    original_principal: Decimal
    original_term_years: int = 30
    annual_rate: Decimal = Decimal("0.065")
    start_date: date
    remaining_term_years: int = 25
    remaining_term_months: int = 0
    repayment_option: Literal["extra_payments", "biweekly"] = "extra_payments"
    extra_monthly: Decimal = Decimal(0)
    extra_monthly_start_date: date | None = None
    extra_yearly: Decimal = Decimal(0)
    extra_yearly_start_date: date | None = None
    extra_one_time: Decimal = Decimal(0)
    extra_one_time_date: date | None = None
    extra_biweekly: Decimal = Decimal(0)
    extra_biweekly_start_date: date | None = None


class HouseAffordabilityInput(BaseModel):
    mode: Literal["income-to-debt", "fixed-budget"] = "income-to-debt"
    annual_income: Decimal = Decimal(0)
    monthly_budget: Decimal = Decimal(0)
    monthly_debts: Decimal = Decimal(0)
    term_years: int = 30
    annual_rate: Decimal = Decimal("0.065")
    down_payment_value: Decimal = Decimal("0.20")
    down_payment_is_percent: bool = True
    property_tax_value: Decimal = Decimal(0)
    property_tax_is_percent: bool = True
    home_insurance_value: Decimal = Decimal(0)
    home_insurance_is_percent: bool = True
    pmi_value: Decimal = Decimal(0)
    pmi_is_percent: bool = True
    hoa_fees_value: Decimal = Decimal(0)
    hoa_fees_is_percent: bool = False
    other_costs_value: Decimal = Decimal(0)
    other_costs_is_percent: bool = False
    dti_preset: Literal["conventional", "fha", "va", "custom"] = "conventional"
    custom_back_end_ratio: Decimal = Decimal("0.36")


class RefinanceInput(BaseModel):
    current_balance: Decimal
    current_monthly_payment: Decimal
    current_rate: Decimal
    new_rate: Decimal
    new_term_years: int = 30
    new_loan_costs_fees: Decimal = Decimal(0)
    new_loan_points: Decimal = Decimal(0)
    cash_out_amount: Decimal = Decimal(0)


class RentVsBuyInput(BaseModel):
    comparison_years: int = 5
    home_price: Decimal
    down_payment_value: Decimal = Decimal("0.20")
    down_payment_is_percent: bool = True
    closing_costs_value: Decimal = Decimal("0.03")
    closing_costs_is_percent: bool = True
    annual_rate: Decimal = Decimal("0.065")
    loan_term_years: int = 30
    property_tax_pct: Decimal = Decimal("0.012")
    home_insurance_pct: Decimal = Decimal("0.005")
    pmi_pct: Decimal = Decimal("0.006")
    hoa_fees_pct: Decimal = Decimal(0)
    other_costs_pct: Decimal = Decimal("0.01")
    home_appreciation_pct: Decimal = Decimal("0.03")
    selling_closing_costs_pct: Decimal = Decimal("0.06")
    monthly_rent: Decimal
    security_deposit: Decimal = Decimal(0)
    rent_upfront_cost: Decimal = Decimal(0)
    rental_increase_pct: Decimal = Decimal("0.03")
    renters_insurance_value: Decimal = Decimal("0.01")
    renters_insurance_is_percent: bool = True
    avg_investment_return: Decimal = Decimal("0.07")
    marginal_federal_rate: Decimal = Decimal("0.22")
    marginal_state_rate: Decimal = Decimal("0.05")
    tax_filing_status: Literal["single", "married_filing_jointly", "head_of_household"] = "single"
