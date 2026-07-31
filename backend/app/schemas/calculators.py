from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class CompoundGrowthInput(BaseModel):
    principal: Decimal = Decimal(0)
    monthly_contribution: Decimal = Decimal(0)
    annual_rate: Decimal = Decimal("0.07")
    years: int = 20


class MortgageInput(BaseModel):
    principal: Decimal
    annual_rate: Decimal = Decimal("0.065")
    term_years: int = 30
    start_date: date
    extra_monthly: Decimal = Decimal(0)
    one_time_extra: Decimal = Decimal(0)
    one_time_extra_month: int | None = None


class DebtPayoffInput(BaseModel):
    balance: Decimal
    annual_rate: Decimal
    monthly_payment: Decimal


class EmergencyFundInput(BaseModel):
    liquid_balance: Decimal = Decimal(0)
    monthly_expense: Decimal = Decimal(0)
    target_months: Decimal = Decimal(6)


class HouseAffordabilityInput(BaseModel):
    gross_monthly_income: Decimal
    monthly_debts: Decimal = Decimal(0)
    down_payment_pct: Decimal = Decimal("0.20")
    annual_rate: Decimal = Decimal("0.065")
    term_years: int = 30
    tax_ins_hoa_monthly: Decimal = Decimal(0)
    front_end_ratio: Decimal = Decimal("0.28")
    back_end_ratio: Decimal = Decimal("0.36")


class RetirementInput(BaseModel):
    current_age: int
    retirement_age: int
    life_expectancy: int = 90
    current_balance: Decimal = Decimal(0)
    monthly_contribution: Decimal = Decimal(0)
    real_return_rate: Decimal = Decimal("0.05")
    withdrawal_rate: Decimal = Decimal("0.04")
    social_security_monthly: Decimal = Decimal(0)


class RebalancingInput(BaseModel):
    current_allocation: dict[str, Decimal]
    target_allocation_pct: dict[str, Decimal]


# --- Backlog pass 2 additions ---


class LoanInput(BaseModel):
    principal: Decimal
    annual_rate: Decimal = Decimal("0.07")
    term_years: int = 5


class RefinanceInput(BaseModel):
    current_balance: Decimal
    current_rate: Decimal
    current_remaining_years: int
    new_rate: Decimal
    new_term_years: int = 30
    closing_costs: Decimal = Decimal(0)


class InterestRateSolverInput(BaseModel):
    principal: Decimal
    target_monthly_payment: Decimal
    term_years: int = 5


class RothIraInput(BaseModel):
    current_balance: Decimal = Decimal(0)
    annual_contribution: Decimal = Decimal("7000")
    years: int = 20
    annual_rate: Decimal = Decimal("0.07")


class TraditionalIraInput(BaseModel):
    current_balance: Decimal = Decimal(0)
    annual_contribution: Decimal = Decimal("7000")
    years: int = 20
    annual_rate: Decimal = Decimal("0.07")


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


class FinancialIndependenceInput(BaseModel):
    current_net_worth: Decimal = Decimal(0)
    annual_savings: Decimal = Decimal(0)
    annual_expenses: Decimal
    expected_return: Decimal = Decimal("0.07")
    withdrawal_rate: Decimal = Decimal("0.04")


class AccelerationDebtItem(BaseModel):
    balance: Decimal
    annual_rate: Decimal
    minimum_payment: Decimal


class DebtAccelerationInput(BaseModel):
    debts: list[AccelerationDebtItem]
    extra_payment: Decimal = Decimal(0)


class TargetEmergencyFundInput(BaseModel):
    current_liquid_balance: Decimal = Decimal(0)
    monthly_expense: Decimal = Decimal(0)
    target_months: Decimal = Decimal(6)
    months_to_reach_goal: int = 12
