from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_current_session, get_tenant_db
from app.routers.scorecard import _category_total, balances_totals_at, gross_annual_income_at, get_household_settings, transaction_sums
from app.schemas.calculators import (
    AmortizationInput,
    CompoundInterestConverterInput,
    DebtConsolidationInput,
    DebtPayoffAvalancheInput,
    FinancialIndependenceInput,
    HouseAffordabilityInput,
    InterestRateSolverInput,
    InvestmentInput,
    K401Input,
    K401MatchMaximizerInput,
    LoanCalculatorInput,
    MortgageInput,
    MortgagePayoffInput,
    RefinanceInput,
    RentVsBuyInput,
    RepaymentCalculatorInput,
    RetirementLongevityInput,
    RetirementNeedInput,
    RetirementSavingsPlanInput,
    RetirementWithdrawalInput,
    RothIraInput,
    SavingsInput,
    SimpleInterestInput,
)
from app.services.calculators import (
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
    retirement_savings_plan,
    retirement_withdrawal,
    roth_ira,
    savings,
    simple_interest,
)

router = APIRouter(prefix="/calculators", tags=["calculators"])

CALCULATORS = {
    "interest-rate": (InterestRateSolverInput, interest_rate_solver.compute),
    "simple-interest": (SimpleInterestInput, simple_interest.compute),
    "financial-independence": (FinancialIndependenceInput, financial_independence.compute),
    # Housing & Mortgage redesign:
    "mortgage": (MortgageInput, mortgage.compute),
    "amortization": (AmortizationInput, amortization.compute),
    "mortgage-payoff": (MortgagePayoffInput, mortgage_payoff.compute),
    "house-affordability": (HouseAffordabilityInput, house_affordability.compute),
    "refinance": (RefinanceInput, refinance.compute),
    "rent-vs-buy": (RentVsBuyInput, rent_vs_buy.compute),
    # Retirement & Investment redesign:
    "retirement-need": (RetirementNeedInput, retirement_need.compute),
    "retirement-savings-plan": (RetirementSavingsPlanInput, retirement_savings_plan.compute),
    "retirement-withdrawal": (RetirementWithdrawalInput, retirement_withdrawal.compute),
    "retirement-longevity": (RetirementLongevityInput, retirement_longevity.compute),
    "investment": (InvestmentInput, investment.compute),
    "401k": (K401Input, k401.compute),
    "401k-match-maximizer": (K401MatchMaximizerInput, k401_match_maximizer.compute),
    "roth-ira": (RothIraInput, roth_ira.compute),
    "compound-interest": (CompoundInterestConverterInput, compound_interest_converter.compute),
    "savings": (SavingsInput, savings.compute),
    # Debt & Payment redesign:
    "loan": (LoanCalculatorInput, loan_calculator.compute),
    "repayment": (RepaymentCalculatorInput, repayment_calculator.compute),
    "debt-payoff": (DebtPayoffAvalancheInput, debt_payoff_avalanche.compute),
    "debt-consolidation": (DebtConsolidationInput, debt_consolidation.compute),
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


def _asset_category_balance(conn: Connection, household_id: str, today: date, *category_names: str) -> Decimal:
    _, _, assets_by_category, _, _ = balances_totals_at(conn, household_id, today)
    return _category_total(assets_by_category, *category_names)


def _open_liability_account_balance(conn: Connection, household_id: str, account_type_pattern: str) -> Decimal | None:
    """Latest balance on the household's single open liability account matching a type pattern
    (e.g. mortgage accounts for Refinance, or the largest non-mortgage loan for Repayment) —
    same "close enough, adjust as needed" precedent as the mortgage-payoff prefill below."""
    row = conn.execute(
        text(
            "select (select balance from balances b where b.account_id = a.account_id order by b.full_date desc limit 1) as latest_balance "
            "from accounts a where a.household_id = :household_id and a.balance_type = 'liability' "
            "and a.account_type ilike :pattern and a.effective_end_date = '9999-12-31' "
            "order by latest_balance desc nulls last limit 1"
        ),
        {"household_id": household_id, "pattern": account_type_pattern},
    ).mappings().first()
    return row["latest_balance"] if row and row["latest_balance"] else None


def _trailing_3mo_monthly_expense(conn: Connection, household_id: str, today: date) -> Decimal:
    window_start = today - relativedelta(months=3)
    txn = transaction_sums(conn, household_id, window_start, today)
    return (txn["expense"] / 3) if txn["expense"] else Decimal(0)


def _open_non_mortgage_liability_accounts(conn: Connection, household_id: str) -> list[dict]:
    """Every open, non-mortgage liability account's latest balance — used to prefill the Debt
    Payoff / Debt Consolidation calculators' debt tables. Interest rate and minimum payment
    aren't tracked on the accounts table, so those are left for the household to fill in."""
    rows = conn.execute(
        text(
            "select a.account_name, "
            "(select balance from balances b where b.account_id = a.account_id order by b.full_date desc limit 1) as latest_balance "
            "from accounts a where a.household_id = :household_id and a.balance_type = 'liability' "
            "and a.account_type not ilike '%mortgage%' and a.effective_end_date = '9999-12-31'"
        ),
        {"household_id": household_id},
    ).mappings().all()
    return [
        {"name": row["account_name"], "balance": str(row["latest_balance"]), "annual_rate": "0", "minimum_payment": "0"}
        for row in rows
        if row["latest_balance"]
    ]


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

    if name in ("debt-payoff", "debt-consolidation"):
        debts = _open_non_mortgage_liability_accounts(conn, household_id)
        return {"debts": debts} if debts else {}

    if name == "house-affordability":
        income = gross_annual_income_at(conn, household_id, today)
        return {"annual_income": str(income)} if income else {}

    # "mortgage" (a prospective new-home shopping tool) has no household data to prefill from —
    # home price and down payment aren't things the app tracks. "mortgage-payoff" is about an
    # existing loan, so the real mortgage account's current balance is a reasonable starting
    # point for original_principal, even though it's technically today's balance rather than
    # the loan's true original principal — same "close enough, adjust as needed" precedent as
    # the debt-payoff/debt-consolidation prefills above (rate/minimum payment aren't tracked
    # either, and are left at 0 for the household to fill in).
    if name == "mortgage-payoff":
        balance = _open_liability_account_balance(conn, household_id, "%mortgage%")
        return {"original_principal": str(balance)} if balance else {}

    # Refinance is about an existing mortgage, so its current balance is a reasonable prefill —
    # current_monthly_payment/current_rate aren't tracked on the accounts table and are left for
    # the household to fill in.
    if name == "refinance":
        balance = _open_liability_account_balance(conn, household_id, "%mortgage%")
        return {"current_balance": str(balance)} if balance else {}

    # Repayment Calculator models a single existing loan — the largest open non-mortgage
    # liability balance is the most likely candidate (rate isn't tracked, left for the household).
    if name == "repayment":
        balance = _open_liability_account_balance(conn, household_id, "%")
        if balance:
            return {"balance": str(balance)}
        return {}

    if name == "investment":
        savings = _asset_category_balance(conn, household_id, today, "Investment", "Investments")
        return {"current_savings": str(savings)} if savings else {}

    if name == "savings":
        balance = _asset_category_balance(conn, household_id, today, "Banking")
        return {"starting_balance": str(balance)} if balance else {}

    if name == "401k-match-maximizer":
        settings = get_household_settings(conn, household_id)
        result: dict = {}
        age = settings.get("household_age")
        if age is not None:
            result["current_age"] = age
        income = gross_annual_income_at(conn, household_id, today)
        if income:
            result["annual_income"] = str(income)
        return result

    if name == "financial-independence":
        total_assets, total_liabilities, _, _, _ = balances_totals_at(conn, household_id, today)
        annual_expenses = _trailing_3mo_monthly_expense(conn, household_id, today) * 12
        return {
            "current_net_worth": str(total_assets - total_liabilities),
            "annual_expenses": str(annual_expenses),
        }

    if name in ("retirement-need", "retirement-savings-plan", "retirement-withdrawal", "401k", "roth-ira"):
        settings = get_household_settings(conn, household_id)
        result: dict = {}
        age = settings.get("household_age")
        if age is not None:
            result["current_age"] = age
        retirement_age = settings.get("target_retirement_age")
        if retirement_age is not None:
            result["retirement_age"] = retirement_age
        retirement_balance = _asset_category_balance(conn, household_id, today, "Retirement")
        income = gross_annual_income_at(conn, household_id, today)

        if name == "retirement-need":
            result["current_savings"] = str(retirement_balance)
            if income:
                result["current_income"] = str(income)
        elif name in ("retirement-savings-plan", "retirement-withdrawal"):
            result["current_retirement_savings"] = str(retirement_balance)
        elif name == "401k":
            result["current_balance"] = str(retirement_balance)
            if income:
                result["annual_income"] = str(income)
        elif name == "roth-ira":
            result["current_balance"] = str(retirement_balance)
        return result

    return {}
