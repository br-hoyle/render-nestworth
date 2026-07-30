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
