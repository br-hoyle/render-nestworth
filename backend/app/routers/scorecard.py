from datetime import date, timedelta
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_current_session, get_tenant_db
from app.schemas.scorecard import KpiHistoryPoint, KpiHistoryResponse, KpiMetric, ScorecardResponse
from app.schemas.settings import merge_with_defaults
from app.services import kpi as kpi_service
from app.services.kpi import KpiInputs

router = APIRouter(tags=["scorecard"])

# Group names match the Scorecard page's 5 sections exactly (the frontend renders one grid
# per group, in this order). needs_ratio/wants_ratio keep their own "Budget rule" group,
# which the Scorecard page no longer renders as tiles — they stay defined here purely so
# GET /scorecard/{slug}/history keeps serving Cash Flow's needs/wants trend charts.
METRICS = [
    # Liquidity & Emergency Reserves
    ("emergency_fund", "Emergency Fund", "Liquidity & Emergency Reserves", "months", kpi_service.emergency_fund_months),
    ("liquid_runway", "Liquid Runway", "Liquidity & Emergency Reserves", "months", kpi_service.liquid_runway_months),
    ("liquidity_ratio", "Liquidity Ratio", "Liquidity & Emergency Reserves", "ratio", kpi_service.liquidity_ratio),
    # Debt & Leverage Management
    ("total_debt", "Total Debt", "Debt & Leverage Management", "dollars", kpi_service.total_debt_value),
    ("debt_to_income", "Debt to Income (DTI)", "Debt & Leverage Management", "percent", kpi_service.debt_to_income),
    ("debt_to_assets_ratio", "Debt to Assets", "Debt & Leverage Management", "percent", kpi_service.debt_to_assets_ratio),
    ("housing_debt_to_equity", "Housing Debt to Equity", "Debt & Leverage Management", "percent", kpi_service.housing_debt_to_equity),
    ("debt_payoff_runway", "Debt Payoff Runway", "Debt & Leverage Management", "months", kpi_service.debt_payoff_runway_months),
    # Cash Flow & Budgeting Efficiency
    ("savings_rate", "Savings Rate", "Cash Flow & Budgeting Efficiency", "percent", kpi_service.savings_rate),
    ("net_cash_flow", "Net Cash Flow", "Cash Flow & Budgeting Efficiency", "dollars", kpi_service.net_cash_flow),
    ("discretionary_spending_rate", "Discretionary Spending Rate", "Cash Flow & Budgeting Efficiency", "percent", kpi_service.discretionary_spending_rate),
    ("housing_cost_ratio", "Housing Cost Ratio", "Cash Flow & Budgeting Efficiency", "percent", kpi_service.housing_cost_ratio),
    ("net_income_rate", "Net Income Rate", "Cash Flow & Budgeting Efficiency", "percent", kpi_service.net_income_rate),
    ("income_growth_rate", "Income Growth Rate", "Cash Flow & Budgeting Efficiency", "percent", kpi_service.income_growth_rate),
    ("savings_efficiency", "Savings Efficiency", "Cash Flow & Budgeting Efficiency", "percent", kpi_service.savings_efficiency),
    # Wealth Accumulation & Balance Sheet Health
    ("net_worth", "Net Worth", "Wealth Accumulation & Balance Sheet Health", "dollars", kpi_service.net_worth_value),
    ("net_worth_velocity", "Net Worth Velocity", "Wealth Accumulation & Balance Sheet Health", "percent", kpi_service.net_worth_velocity),
    # fi_progress (expense-based "25x expenses" FI number) — kept on Overview as "Target Net
    # Worth" and additionally surfaced here per the household's explicit request; slug stays
    # put so existing thresholds/assumptions/content keyed by slug don't need to move.
    ("fi_progress", "Target Net Worth", "Wealth Accumulation & Balance Sheet Health", "dollars", kpi_service.fi_progress),
    # Retirement & Financial Independence
    # target_net_worth (age-based savings-annuity projection) is the household's existing
    # "Financial Independence" metric — not a new Millionaire-Next-Door formula, per their
    # explicit call that the two are the same thing conceptually.
    ("target_net_worth", "Financial Independence", "Retirement & Financial Independence", "dollars", kpi_service.target_net_worth),
    ("future_investment_balance", "Future Investment Balance", "Retirement & Financial Independence", "dollars", kpi_service.future_investment_balance),
    ("future_retirement_balance", "Future Retirement Balance", "Retirement & Financial Independence", "dollars", kpi_service.future_retirement_balance),
    # Budget rule — not rendered on the Scorecard page; kept alive for Cash Flow's history charts.
    ("needs_ratio", "Needs", "Budget rule", "percent", kpi_service.needs_ratio),
    ("wants_ratio", "Wants", "Budget rule", "percent", kpi_service.wants_ratio),
]


def balances_totals_at(
    conn: Connection, household_id: str, as_of: date
) -> tuple[Decimal, Decimal, dict[str, Decimal], dict[str, Decimal], dict[str, Decimal]]:
    """Returns (total_assets, total_liabilities, assets_by_category, liabilities_by_category,
    balance_by_account_type)."""
    rows = conn.execute(
        text(
            """
            select a.category, a.account_type, a.balance_type,
                   (select b.balance from balances b
                    where b.account_id = a.account_id and b.full_date <= :as_of
                    order by b.full_date desc limit 1) as balance
            from accounts a
            where a.household_id = :household_id
              and a.effective_start_date <= :as_of and a.effective_end_date >= :as_of
            """
        ),
        {"household_id": household_id, "as_of": as_of},
    ).mappings().all()

    total_assets = Decimal(0)
    total_liabilities = Decimal(0)
    assets_by_category: dict[str, Decimal] = {}
    liabilities_by_category: dict[str, Decimal] = {}
    balance_by_type: dict[str, Decimal] = {}

    for row in rows:
        balance = row["balance"] or Decimal(0)
        balance_by_type[row["account_type"]] = balance_by_type.get(row["account_type"], Decimal(0)) + balance
        if row["balance_type"] == "asset":
            total_assets += balance
            assets_by_category[row["category"]] = assets_by_category.get(row["category"], Decimal(0)) + balance
        else:
            total_liabilities += balance
            liabilities_by_category[row["category"]] = liabilities_by_category.get(row["category"], Decimal(0)) + balance

    return total_assets, total_liabilities, assets_by_category, liabilities_by_category, balance_by_type


def gross_annual_income_at(conn: Connection, household_id: str, as_of: date) -> Decimal:
    row = conn.execute(
        text(
            "select coalesce(sum(income), 0) as total from income "
            "where household_id = :household_id and effective_start_date <= :as_of and effective_end_date >= :as_of"
        ),
        {"household_id": household_id, "as_of": as_of},
    ).mappings().first()
    return row["total"]


def transaction_sums(conn: Connection, household_id: str, start: date, end: date) -> dict:
    row = conn.execute(
        text(
            """
            select
                coalesce(sum(amount) filter (where type = 'income'), 0) as income,
                coalesce(sum(-amount) filter (where type = 'expense'), 0) as expense,
                coalesce(sum(-amount) filter (where type = 'expense' and ("group" ilike '%housing%' or item ilike '%mortgage%')), 0) as housing
            from transactions
            where household_id = :household_id and date >= :start and date <= :end
            """
        ),
        {"household_id": household_id, "start": start, "end": end},
    ).mappings().first()
    return row


def classified_expense_sums(conn: Connection, household_id: str, start: date, end: date) -> dict:
    """Sums expense transactions by flow_type (needs/wants/savings), joining
    transaction_categories on an exact group+item rule first, falling back to a
    group-level rule (item = ''). Returns has_classified=False when the household hasn't
    classified anything yet, so KPIs can fall back gracefully rather than showing all-zero."""
    row = conn.execute(
        text(
            """
            with joined as (
                select t.amount,
                    coalesce(tc_item.flow_type, tc_group.flow_type) as flow_type
                from transactions t
                left join transaction_categories tc_item
                    on tc_item.household_id = t.household_id
                    and tc_item."group" = coalesce(t."group", '')
                    and tc_item.item = coalesce(t.item, '')
                left join transaction_categories tc_group
                    on tc_group.household_id = t.household_id
                    and tc_group."group" = coalesce(t."group", '')
                    and tc_group.item = ''
                where t.household_id = :household_id
                    and t.type = 'expense'
                    and t.date >= :start and t.date <= :end
            )
            select
                coalesce(sum(-amount) filter (where flow_type = 'needs'), 0) as needs,
                coalesce(sum(-amount) filter (where flow_type = 'wants'), 0) as wants,
                coalesce(sum(-amount) filter (where flow_type = 'savings'), 0) as savings,
                count(*) filter (where flow_type is not null) as classified_count
            from joined
            """
        ),
        {"household_id": household_id, "start": start, "end": end},
    ).mappings().first()
    return row


def _category_total(by_category: dict[str, Decimal], *names: str) -> Decimal:
    """Case-insensitive lookup across one or more category spellings — `category` is free
    text (no DB enum), and real households' data can drift from the current dropdown's
    vocabulary (e.g. older seed data using "Investments" where the form now writes
    "Investment"). Matching case-insensitively and across a couple of accepted spellings
    avoids silently zeroing out a household's data over a naming mismatch."""
    lowered = {k.lower(): v for k, v in by_category.items()}
    matched_keys = {name.lower() for name in names} & lowered.keys()
    return sum((lowered[key] for key in matched_keys), Decimal(0))


def monthly_income_transaction_sums(conn: Connection, household_id: str, start: date, end: date) -> dict[str, Decimal]:
    """Actual income-type transactions summed per calendar month — the real "banked income"
    series Income Growth Rate compares month to month (distinct from the effective-dated,
    on-paper gross_annual_income_at)."""
    rows = conn.execute(
        text(
            """
            select to_char(date_trunc('month', date), 'YYYY-MM') as month, sum(amount) as total
            from transactions
            where household_id = :household_id and type = 'income' and date >= :start and date <= :end
            group by date_trunc('month', date)
            """
        ),
        {"household_id": household_id, "start": start, "end": end},
    ).mappings().all()
    return {r["month"]: r["total"] for r in rows}


def build_kpi_inputs(conn: Connection, household_id: str, as_of: date, settings: dict) -> KpiInputs:
    total_assets, total_liabilities, assets_by_category, liabilities_by_category, balance_by_type = balances_totals_at(
        conn, household_id, as_of
    )

    liquid_types = {t.lower() for t in settings.get("liquid_account_types", [])}
    cash_types = {t.lower() for t in settings.get("cash_account_types", [])}
    liquid_balance = sum((v for k, v in balance_by_type.items() if k.lower() in liquid_types), Decimal(0))
    cash_balance = sum((v for k, v in balance_by_type.items() if k.lower() in cash_types), Decimal(0))

    net_worth = total_assets - total_liabilities

    one_year_ago = as_of - relativedelta(years=1)
    assets_1y, liabilities_1y, _, _, _ = balances_totals_at(conn, household_id, one_year_ago)
    net_worth_1y = assets_1y - liabilities_1y

    six_months_ago = as_of - relativedelta(months=6)
    _, liabilities_6mo, _, _, _ = balances_totals_at(conn, household_id, six_months_ago)
    liability_reduction_6mo = liabilities_6mo - total_liabilities

    three_months_ago = as_of - relativedelta(months=3)
    _, liabilities_3mo, _, _, _ = balances_totals_at(conn, household_id, three_months_ago)
    liability_reduction_3mo = liabilities_3mo - total_liabilities

    property_asset_value = _category_total(assets_by_category, "Property")
    property_liability_value = _category_total(liabilities_by_category, "Property")
    investment_asset_value = _category_total(assets_by_category, "Investment", "Investments")
    retirement_asset_value = _category_total(assets_by_category, "Retirement")

    # Income Growth Rate: this month's actual income transactions vs. the average of the 12
    # full calendar months before it.
    income_window_start = as_of - relativedelta(months=13)
    monthly_income = monthly_income_transaction_sums(conn, household_id, income_window_start, as_of)
    current_month_income = monthly_income.get(as_of.strftime("%Y-%m"), Decimal(0))
    prior_month_values = [
        monthly_income[key]
        for key in (
            (as_of - relativedelta(months=k)).strftime("%Y-%m") for k in range(1, 13)
        )
        if key in monthly_income
    ]
    trailing_12mo_avg_income = (
        sum(prior_month_values, Decimal(0)) / len(prior_month_values) if prior_month_values else None
    )

    gross_annual_income = gross_annual_income_at(conn, household_id, as_of)

    expense_basis = settings.get("expense_basis", "3mo")
    window_months = 12 if expense_basis == "12mo" else 3
    window_start = as_of - relativedelta(months=window_months)
    txn = transaction_sums(conn, household_id, window_start, as_of)

    trailing_income = txn["income"]
    if expense_basis == "manual" and settings.get("manual_monthly_expense") is not None:
        trailing_expense = Decimal(str(settings["manual_monthly_expense"])) * window_months
    else:
        trailing_expense = txn["expense"]

    classified = classified_expense_sums(conn, household_id, window_start, as_of)
    has_classified = classified["classified_count"] > 0
    needs_trailing = classified["needs"] if has_classified else None
    wants_trailing = classified["wants"] if has_classified else None
    savings_trailing = classified["savings"] if has_classified else None

    # Fixed 12-month window for Savings Efficiency / Net Worth Velocity, independent of the
    # expense_basis-driven trailing window above (matches net_worth_growth_yoy's 1yr compare).
    txn_12mo = transaction_sums(conn, household_id, one_year_ago, as_of)
    gross_income_12mo = txn_12mo["income"]
    net_income_12mo = txn_12mo["income"] - txn_12mo["expense"]

    return KpiInputs(
        net_worth=net_worth,
        net_worth_one_year_ago=net_worth_1y,
        total_assets=total_assets,
        total_liabilities=total_liabilities,
        liquid_balance=liquid_balance,
        cash_balance=cash_balance,
        gross_annual_income=gross_annual_income,
        trailing_income=trailing_income,
        trailing_expense=trailing_expense,
        trailing_months=window_months,
        housing_expense_trailing=txn["housing"],
        liability_reduction_trailing_6mo=liability_reduction_6mo,
        settings=settings,
        needs_expense_trailing=needs_trailing,
        wants_expense_trailing=wants_trailing,
        savings_flow_trailing=savings_trailing,
        gross_income_trailing_12mo=gross_income_12mo,
        net_income_trailing_12mo=net_income_12mo,
        liability_reduction_trailing_3mo=liability_reduction_3mo,
        property_asset_value=property_asset_value,
        property_liability_value=property_liability_value,
        investment_asset_value=investment_asset_value,
        retirement_asset_value=retirement_asset_value,
        current_month_income=current_month_income,
        trailing_12mo_avg_income=trailing_12mo_avg_income,
    )


def get_household_settings(conn: Connection, household_id: str) -> dict:
    row = conn.execute(
        text("select settings from household_settings where household_id = :household_id"),
        {"household_id": household_id},
    ).mappings().first()
    return merge_with_defaults(row["settings"] if row else {})


@router.get("/scorecard", response_model=ScorecardResponse)
def get_scorecard(
    as_of: date | None = None,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> ScorecardResponse:
    today = as_of or date.today()
    settings = get_household_settings(conn, session.household_id)
    inputs = build_kpi_inputs(conn, session.household_id, today, settings)

    metrics = []
    for slug, label, group, unit, fn in METRICS:
        result = fn(inputs)
        value, color, progress_pct = result if len(result) == 3 else (*result, None)
        metrics.append(
            KpiMetric(slug=slug, label=label, group=group, value=value, unit=unit, color=color, progress_pct=progress_pct)
        )

    return ScorecardResponse(as_of=today.isoformat(), metrics=metrics)


_METRIC_FNS = {slug: fn for slug, _, _, _, fn in METRICS}


@router.get("/scorecard/{slug}/history", response_model=KpiHistoryResponse)
def get_metric_history(
    slug: str,
    months: int = 24,
    end: date | None = None,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> KpiHistoryResponse:
    if slug not in _METRIC_FNS:
        raise HTTPException(404, detail="Unknown metric")

    fn = _METRIC_FNS[slug]
    settings = get_household_settings(conn, session.household_id)
    today = end or date.today()

    points = []
    for i in range(months, -1, -1):
        cutoff = today - relativedelta(months=i)
        inputs = build_kpi_inputs(conn, session.household_id, cutoff, settings)
        result = fn(inputs)
        # For dollar-target metrics, chart progress-to-target over time (the meaningful
        # trend) rather than the target itself, which barely moves month to month.
        value = result[2] if len(result) == 3 else result[0]
        points.append(KpiHistoryPoint(date=cutoff.isoformat(), value=value))

    return KpiHistoryResponse(slug=slug, points=points)
