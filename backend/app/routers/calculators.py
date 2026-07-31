from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_current_session, get_tenant_db
from app.routers.scorecard import balances_totals_at, gross_annual_income_at, get_household_settings, transaction_sums
from app.schemas.calculators import (
    CompoundGrowthInput,
    DebtAccelerationInput,
    DebtConsolidationInput,
    DebtPayoffInput,
    EmergencyFundInput,
    FinancialIndependenceInput,
    HouseAffordabilityInput,
    InterestRateSolverInput,
    LoanInput,
    MortgageInput,
    RebalancingInput,
    RefinanceInput,
    RetirementInput,
    RothIraInput,
    SimpleInterestInput,
    TargetEmergencyFundInput,
    TraditionalIraInput,
)
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

router = APIRouter(prefix="/calculators", tags=["calculators"])

CALCULATORS = {
    "compound-growth": (CompoundGrowthInput, compound_growth.compute),
    "mortgage": (MortgageInput, mortgage.compute),
    "debt-payoff": (DebtPayoffInput, debt_payoff.compute),
    "emergency-fund": (EmergencyFundInput, emergency_fund.compute),
    "house-affordability": (HouseAffordabilityInput, house_affordability.compute),
    "retirement": (RetirementInput, retirement.compute),
    "rebalancing": (RebalancingInput, rebalancing.compute),
    # Backlog pass 2 — genuinely new math:
    "loan": (LoanInput, loan.compute),
    "refinance": (RefinanceInput, refinance.compute),
    "interest-rate": (InterestRateSolverInput, interest_rate_solver.compute),
    "roth-ira": (RothIraInput, roth_ira.compute),
    "ira": (TraditionalIraInput, traditional_ira.compute),
    "simple-interest": (SimpleInterestInput, simple_interest.compute),
    "debt-consolidation": (DebtConsolidationInput, debt_consolidation.compute),
    "financial-independence": (FinancialIndependenceInput, financial_independence.compute),
    "debt-acceleration": (DebtAccelerationInput, debt_acceleration.compute),
    "target-emergency-fund": (TargetEmergencyFundInput, target_emergency_fund.compute),
    # Backlog pass 2 — registry-only relabels of existing math (same compute fn, different
    # default inputs/labels/grouping in the frontend; avoids duplicating identical formulas):
    "investment": (CompoundGrowthInput, compound_growth.compute),
    "compound-interest": (CompoundGrowthInput, compound_growth.compute),
    "savings": (CompoundGrowthInput, compound_growth.compute),
    "amortization": (LoanInput, loan.compute),
    "repayment": (LoanInput, loan.compute),
    "student-loan": (LoanInput, loan.compute),
}


@router.post("/{name}")
def run_calculator(
    name: str,
    payload: dict,
    session: Session = Depends(get_current_session),
) -> dict:
    if name not in CALCULATORS:
        raise HTTPException(404, detail="Unknown calculator")
    input_model, compute_fn = CALCULATORS[name]
    validated = input_model(**payload)
    return compute_fn(**validated.model_dump())


@router.get("/{name}/defaults")
def calculator_defaults(
    name: str,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> dict:
    if name not in CALCULATORS:
        raise HTTPException(404, detail="Unknown calculator")

    today = date.today()
    household_id = session.household_id

    if name == "mortgage":
        row = conn.execute(
            text(
                "select account_id, effective_start_date, "
                "(select balance from balances b where b.account_id = a.account_id order by b.full_date desc limit 1) as latest_balance "
                "from accounts a where a.household_id = :household_id and a.balance_type = 'liability' "
                "and a.account_type ilike '%mortgage%' and a.effective_end_date = '9999-12-31' limit 1"
            ),
            {"household_id": household_id},
        ).mappings().first()
        if row and row["latest_balance"]:
            return {"principal": str(row["latest_balance"]), "start_date": row["effective_start_date"].isoformat()}
        return {}

    if name == "debt-payoff":
        row = conn.execute(
            text(
                "select (select balance from balances b where b.account_id = a.account_id order by b.full_date desc limit 1) as latest_balance "
                "from accounts a where a.household_id = :household_id and a.balance_type = 'liability' "
                "and a.account_type not ilike '%mortgage%' and a.effective_end_date = '9999-12-31' limit 1"
            ),
            {"household_id": household_id},
        ).mappings().first()
        if row and row["latest_balance"]:
            return {"balance": str(row["latest_balance"])}
        return {}

    if name == "emergency-fund":
        settings = get_household_settings(conn, household_id)
        _, _, _, balance_by_type = balances_totals_at(conn, household_id, today)
        liquid_types = {t.lower() for t in settings.get("liquid_account_types", [])}
        liquid_balance = sum(
            (v for k, v in balance_by_type.items() if k.lower() in liquid_types), Decimal(0)
        )
        window_start = today - relativedelta(months=3)
        txn = transaction_sums(conn, household_id, window_start, today)
        monthly_expense = (txn["expense"] / 3) if txn["expense"] else Decimal(0)
        return {"liquid_balance": str(liquid_balance), "monthly_expense": str(monthly_expense)}

    if name == "house-affordability":
        income = gross_annual_income_at(conn, household_id, today)
        return {"gross_monthly_income": str(income / 12)} if income else {}

    if name == "retirement":
        _, _, assets_by_category, _ = balances_totals_at(conn, household_id, today)
        retirement_balance = assets_by_category.get("Retirement", 0)
        return {"current_balance": str(retirement_balance)}

    if name == "amortization":
        row = conn.execute(
            text(
                "select account_id, "
                "(select balance from balances b where b.account_id = a.account_id order by b.full_date desc limit 1) as latest_balance "
                "from accounts a where a.household_id = :household_id and a.balance_type = 'liability' "
                "and a.account_type ilike '%mortgage%' and a.effective_end_date = '9999-12-31' limit 1"
            ),
            {"household_id": household_id},
        ).mappings().first()
        if row and row["latest_balance"]:
            return {"principal": str(row["latest_balance"])}
        return {}

    if name == "target-emergency-fund":
        settings = get_household_settings(conn, household_id)
        _, _, _, balance_by_type = balances_totals_at(conn, household_id, today)
        liquid_types = {t.lower() for t in settings.get("liquid_account_types", [])}
        liquid_balance = sum(
            (v for k, v in balance_by_type.items() if k.lower() in liquid_types), Decimal(0)
        )
        window_start = today - relativedelta(months=3)
        txn = transaction_sums(conn, household_id, window_start, today)
        monthly_expense = (txn["expense"] / 3) if txn["expense"] else Decimal(0)
        return {"current_liquid_balance": str(liquid_balance), "monthly_expense": str(monthly_expense)}

    if name == "financial-independence":
        total_assets, total_liabilities, _, _ = balances_totals_at(conn, household_id, today)
        window_start = today - relativedelta(months=3)
        txn = transaction_sums(conn, household_id, window_start, today)
        annual_expenses = (txn["expense"] / 3 * 12) if txn["expense"] else Decimal(0)
        return {
            "current_net_worth": str(total_assets - total_liabilities),
            "annual_expenses": str(annual_expenses),
        }

    return {}
