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

METRICS = [
    ("emergency_fund", "Emergency fund", "Safety", "months", kpi_service.emergency_fund_months),
    ("liquidity_ratio", "Liquidity ratio", "Safety", "ratio", kpi_service.liquidity_ratio),
    ("housing_cost_ratio", "Housing cost ratio", "Safety", "percent", kpi_service.housing_cost_ratio),
    ("savings_rate", "Savings rate", "Growth", "percent", kpi_service.savings_rate),
    ("net_worth_growth_yoy", "Net worth growth (YoY)", "Growth", "percent", kpi_service.net_worth_growth_yoy),
    # Labels are intentionally swapped relative to slug/function names: the household wants
    # the expense-based number (fi_progress fn) displayed as "Target net worth" and the
    # age-based savings-annuity number (target_net_worth fn) displayed as "Financial
    # Independence" — slugs stay put so thresholds/assumptions/content keyed by slug
    # elsewhere don't need to move.
    ("fi_progress", "Target net worth", "Growth", "dollars", kpi_service.fi_progress),
    ("target_net_worth", "Financial Independence", "Growth", "dollars", kpi_service.target_net_worth),
    ("debt_to_income", "Debt-to-income", "Debt & mix", "percent", kpi_service.debt_to_income),
    ("debt_payoff_runway", "Debt payoff runway", "Debt & mix", "months", kpi_service.debt_payoff_runway_months),
    ("net_worth", "Net worth", "Debt & mix", "dollars", kpi_service.net_worth_value),
    # Backlog pass 2 additions:
    ("debt_to_assets_ratio", "Debt-to-assets", "Efficiency", "percent", kpi_service.debt_to_assets_ratio),
    ("liquid_runway", "Liquid runway", "Efficiency", "months", kpi_service.liquid_runway_months),
    ("savings_efficiency", "Savings efficiency", "Efficiency", "percent", kpi_service.savings_efficiency),
    ("net_worth_velocity", "Net worth velocity", "Efficiency", "percent", kpi_service.net_worth_velocity),
    ("needs_ratio", "Needs", "Budget rule", "percent", kpi_service.needs_ratio),
    ("wants_ratio", "Wants", "Budget rule", "percent", kpi_service.wants_ratio),
    ("savings_ratio", "Savings", "Budget rule", "percent", kpi_service.savings_ratio),
]


def balances_totals_at(conn: Connection, household_id: str, as_of: date) -> tuple[Decimal, Decimal, dict[str, Decimal], dict[str, Decimal]]:
    """Returns (total_assets, total_liabilities, assets_by_category, balance_by_account_type)."""
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
    balance_by_type: dict[str, Decimal] = {}

    for row in rows:
        balance = row["balance"] or Decimal(0)
        balance_by_type[row["account_type"]] = balance_by_type.get(row["account_type"], Decimal(0)) + balance
        if row["balance_type"] == "asset":
            total_assets += balance
            assets_by_category[row["category"]] = assets_by_category.get(row["category"], Decimal(0)) + balance
        else:
            total_liabilities += balance

    return total_assets, total_liabilities, assets_by_category, balance_by_type


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


def build_kpi_inputs(conn: Connection, household_id: str, as_of: date, settings: dict) -> KpiInputs:
    total_assets, total_liabilities, _, balance_by_type = balances_totals_at(conn, household_id, as_of)

    liquid_types = {t.lower() for t in settings.get("liquid_account_types", [])}
    cash_types = {t.lower() for t in settings.get("cash_account_types", [])}
    liquid_balance = sum((v for k, v in balance_by_type.items() if k.lower() in liquid_types), Decimal(0))
    cash_balance = sum((v for k, v in balance_by_type.items() if k.lower() in cash_types), Decimal(0))

    net_worth = total_assets - total_liabilities

    one_year_ago = as_of - relativedelta(years=1)
    assets_1y, liabilities_1y, _, _ = balances_totals_at(conn, household_id, one_year_ago)
    net_worth_1y = assets_1y - liabilities_1y

    six_months_ago = as_of - relativedelta(months=6)
    _, liabilities_6mo, _, _ = balances_totals_at(conn, household_id, six_months_ago)
    liability_reduction_6mo = liabilities_6mo - total_liabilities

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
