from bisect import bisect_left, bisect_right
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_current_session, get_tenant_db
from app.schemas.scorecard import (
    AllKpiHistoryResponse,
    KpiHistoryPoint,
    KpiHistoryResponse,
    KpiInputItem,
    KpiMetric,
    ScorecardResponse,
)
from app.schemas.settings import merge_with_defaults
from app.security import decrypt_pii
from app.services import kpi as kpi_service
from app.services.age import age_from_birthdate
from app.services.cashflow_rules import EXCLUDED_CASHFLOW_GROUP, is_excluded_cashflow_group
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
    # Debt & Leverage Management — order matches the household's requested 2-row layout
    # (row 1: Total Debt / Debt Payoff Runway / Debt to Assets; row 2: Total Non-Property
    # Debt / Housing Debt to Equity / Debt to Income), enforced explicitly by the Scorecard
    # page's per-group row layout rather than relied on for flex-wrap ordering alone.
    ("total_debt", "Total Debt", "Debt & Leverage Management", "dollars", kpi_service.total_debt_value),
    ("debt_payoff_runway", "Debt Payoff Runway", "Debt & Leverage Management", "months", kpi_service.debt_payoff_runway_months),
    ("debt_to_assets_ratio", "Debt to Assets", "Debt & Leverage Management", "percent", kpi_service.debt_to_assets_ratio),
    (
        "total_non_property_debt",
        "Total Non-Property Debt",
        "Debt & Leverage Management",
        "dollars",
        kpi_service.total_non_property_debt_value,
    ),
    ("housing_debt_to_equity", "Housing Debt to Equity", "Debt & Leverage Management", "percent", kpi_service.housing_debt_to_equity),
    ("debt_to_income", "Debt to Income (DTI)", "Debt & Leverage Management", "percent", kpi_service.debt_to_income),
    # Cash Flow & Budgeting Efficiency — row 1: Net Cash Flow / Net Income Rate / Savings
    # Rate / Discretionary Spending Rate; row 2: Income Growth Rate / Housing Cost Ratio /
    # Savings Efficiency (same explicit-row-layout note as above).
    ("net_cash_flow", "Net Cash Flow", "Cash Flow & Budgeting Efficiency", "dollars", kpi_service.net_cash_flow),
    ("net_income_rate", "Net Income Rate", "Cash Flow & Budgeting Efficiency", "percent", kpi_service.net_income_rate),
    ("savings_rate", "Savings Rate", "Cash Flow & Budgeting Efficiency", "percent", kpi_service.savings_rate),
    ("discretionary_spending_rate", "Discretionary Spending Rate", "Cash Flow & Budgeting Efficiency", "percent", kpi_service.discretionary_spending_rate),
    ("income_growth_rate", "Income Growth Rate", "Cash Flow & Budgeting Efficiency", "percent", kpi_service.income_growth_rate),
    ("housing_cost_ratio", "Housing Cost Ratio", "Cash Flow & Budgeting Efficiency", "percent", kpi_service.housing_cost_ratio),
    ("savings_efficiency", "Savings Efficiency", "Cash Flow & Budgeting Efficiency", "percent", kpi_service.savings_efficiency),
    # Wealth Accumulation & Balance Sheet Health
    ("net_worth", "Net Worth", "Wealth Accumulation & Balance Sheet Health", "dollars", kpi_service.net_worth_value),
    ("net_worth_velocity", "Net Worth Velocity", "Wealth Accumulation & Balance Sheet Health", "percent", kpi_service.net_worth_velocity),
    # fi_progress (expense-based "25x expenses" FI number) — kept on Overview as "Financial
    # Independence" and additionally surfaced here per the household's explicit request; slug
    # stays put so existing thresholds/assumptions/content keyed by slug don't need to move.
    ("fi_progress", "Financial Independence", "Wealth Accumulation & Balance Sheet Health", "dollars", kpi_service.fi_progress),
    # Retirement & Financial Independence
    # target_net_worth (age-based savings-annuity projection) is the household's existing
    # "Target Net Worth" metric — not a new Millionaire-Next-Door formula, per their
    # explicit call that the two are the same thing conceptually.
    ("target_net_worth", "Target Net Worth", "Retirement & Financial Independence", "dollars", kpi_service.target_net_worth),
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
              and lower(trim(coalesce("group", ''))) <> :excluded_group
            """
        ),
        {"household_id": household_id, "start": start, "end": end, "excluded_group": EXCLUDED_CASHFLOW_GROUP},
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
                    and lower(trim(coalesce(t."group", ''))) <> :excluded_group
            )
            select
                coalesce(sum(-amount) filter (where flow_type = 'needs'), 0) as needs,
                coalesce(sum(-amount) filter (where flow_type = 'wants'), 0) as wants,
                coalesce(sum(-amount) filter (where flow_type = 'savings'), 0) as savings,
                count(*) filter (where flow_type is not null) as classified_count
            from joined
            """
        ),
        {"household_id": household_id, "start": start, "end": end, "excluded_group": EXCLUDED_CASHFLOW_GROUP},
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


# ---------------------------------------------------------------------------------------
# Batched dataset for build_kpi_inputs across MANY as_of dates in a handful of queries total
# ---------------------------------------------------------------------------------------
# The naive approach — call build_kpi_inputs() once per as_of date — issues ~8 sequential
# DB round trips per date (balances x4, transactions x3, income x1). For a 12-month history
# (13 dates) that's 100+ round trips to a remote Postgres instance; at ~50-60ms/round-trip
# that's 6-13+ seconds, reproduced against the real Supabase DB. The fix: fetch every
# underlying table ONCE across the whole date range this request needs, then compute each
# date's KpiInputs snapshot in memory (bisect/prefix-sum lookups, no further queries) — turns
# O(dates x 8) round trips into O(1), independent of how many dates are requested.


@dataclass
class _AccountMeta:
    account_id: str
    category: str
    account_type: str
    balance_type: str
    effective_start_date: date
    effective_end_date: date


@dataclass
class _TxnSeries:
    """Per-day category sums, as parallel prefix-sum arrays over `dates` (sorted, unique days
    that have at least one transaction) — window_sum(key, start, end) below answers any
    [start, end] range in O(log n) via bisect, matching `WHERE date >= start AND date <= end`
    exactly without a fresh query per window."""

    dates: list[date] = field(default_factory=list)
    prefixes: dict[str, list[Decimal]] = field(default_factory=dict)

    def window_sum(self, key: str, start: date, end: date) -> Decimal:
        prefix = self.prefixes[key]
        lo = bisect_left(self.dates, start)
        hi = bisect_right(self.dates, end)
        return prefix[hi] - prefix[lo]


@dataclass
class _KpiDataset:
    accounts: list[_AccountMeta]
    balances_by_account: dict[str, tuple[list[date], list[Decimal]]]
    income_records: list[dict]
    txn: _TxnSeries
    monthly_income: dict[str, Decimal]


def _load_kpi_dataset(conn: Connection, household_id: str, as_of_dates: list[date]) -> _KpiDataset:
    account_rows = conn.execute(
        text(
            """
            select account_id, category, account_type, balance_type,
                   effective_start_date, effective_end_date
            from accounts
            where household_id = :household_id
            """
        ),
        {"household_id": household_id},
    ).mappings().all()
    accounts = [
        _AccountMeta(
            account_id=str(r["account_id"]),
            category=r["category"],
            account_type=r["account_type"],
            balance_type=r["balance_type"],
            effective_start_date=r["effective_start_date"],
            effective_end_date=r["effective_end_date"],
        )
        for r in account_rows
    ]

    # No lower date bound on balances — forward-fill needs the true latest-known balance as
    # of even the earliest requested date, however old that snapshot is.
    balance_rows = conn.execute(
        text(
            """
            select b.account_id, b.full_date, b.balance
            from balances b
            join accounts a on a.account_id = b.account_id
            where a.household_id = :household_id
            order by b.account_id, b.full_date
            """
        ),
        {"household_id": household_id},
    ).mappings().all()
    balances_by_account: dict[str, tuple[list[date], list[Decimal]]] = {}
    for r in balance_rows:
        acct_id = str(r["account_id"])
        dates_list, values_list = balances_by_account.setdefault(acct_id, ([], []))
        dates_list.append(r["full_date"])
        values_list.append(r["balance"])

    income_rows = conn.execute(
        text(
            "select income, effective_start_date, effective_end_date from income where household_id = :household_id"
        ),
        {"household_id": household_id},
    ).mappings().all()
    income_records = [dict(r) for r in income_rows]

    # Transactions bounded to the widest lookback any as_of date could need (25 months, for
    # Income Growth Rate's year-over-year comparison: 12 months to average for the trailing
    # window, another 12 before that for the prior window, plus 1 month of buffer) — not the
    # household's entire history.
    txn_start = min(as_of_dates) - relativedelta(months=25)
    txn_end = max(as_of_dates)

    category_rows = conn.execute(
        text('select "group", item, flow_type from transaction_categories where household_id = :household_id'),
        {"household_id": household_id},
    ).mappings().all()
    exact_flow = {(r["group"], r["item"]): r["flow_type"] for r in category_rows}
    group_flow = {r["group"]: r["flow_type"] for r in category_rows if r["item"] == ""}

    txn_rows = conn.execute(
        text(
            """
            select date, amount, type, "group", item
            from transactions
            where household_id = :household_id and date >= :start and date <= :end
            order by date
            """
        ),
        {"household_id": household_id, "start": txn_start, "end": txn_end},
    ).mappings().all()

    keys = ("income", "expense", "housing", "needs", "wants", "savings", "classified")
    day_agg: dict[date, dict[str, Decimal]] = {}
    for r in txn_rows:
        group = r["group"] or ""
        if is_excluded_cashflow_group(group):
            # "Savings & Investments" transactions are transfers into asset-building
            # accounts, not spending — ignored entirely for cash-flow purposes (see
            # cashflow_rules.py), on both the income and expense side.
            continue
        d = r["date"]
        agg = day_agg.setdefault(d, {k: Decimal(0) for k in keys})
        amount = r["amount"]
        if r["type"] == "income":
            agg["income"] += amount
            continue
        expense_amt = -amount
        agg["expense"] += expense_amt
        item = r["item"] or ""
        if "housing" in group.lower() or "mortgage" in item.lower():
            agg["housing"] += expense_amt
        flow_type = exact_flow.get((group, item), group_flow.get(group))
        if flow_type is not None:
            agg["classified"] += 1
            if flow_type == "needs":
                agg["needs"] += expense_amt
            elif flow_type == "wants":
                agg["wants"] += expense_amt
            elif flow_type == "savings":
                agg["savings"] += expense_amt

    sorted_dates = sorted(day_agg.keys())
    prefixes: dict[str, list[Decimal]] = {}
    for k in keys:
        prefix = [Decimal(0)]
        for d in sorted_dates:
            prefix.append(prefix[-1] + day_agg[d][k])
        prefixes[k] = prefix
    txn_series = _TxnSeries(dates=sorted_dates, prefixes=prefixes)

    monthly_income: dict[str, Decimal] = {}
    for d, agg in day_agg.items():
        month = d.strftime("%Y-%m")
        monthly_income[month] = monthly_income.get(month, Decimal(0)) + agg["income"]

    return _KpiDataset(
        accounts=accounts,
        balances_by_account=balances_by_account,
        income_records=income_records,
        txn=txn_series,
        monthly_income=monthly_income,
    )


def _balances_totals_at_dataset(
    dataset: _KpiDataset, as_of: date
) -> tuple[Decimal, Decimal, dict[str, Decimal], dict[str, Decimal], dict[str, Decimal]]:
    """In-memory equivalent of balances_totals_at — same account-open-window + latest-known-
    balance-per-account logic, looked up via bisect instead of a correlated SQL subquery."""
    total_assets = Decimal(0)
    total_liabilities = Decimal(0)
    assets_by_category: dict[str, Decimal] = {}
    liabilities_by_category: dict[str, Decimal] = {}
    balance_by_type: dict[str, Decimal] = {}

    for acct in dataset.accounts:
        if not (acct.effective_start_date <= as_of <= acct.effective_end_date):
            continue
        dates_list, values_list = dataset.balances_by_account.get(acct.account_id, ([], []))
        idx = bisect_right(dates_list, as_of)
        balance = values_list[idx - 1] if idx > 0 else Decimal(0)

        balance_by_type[acct.account_type] = balance_by_type.get(acct.account_type, Decimal(0)) + balance
        if acct.balance_type == "asset":
            total_assets += balance
            assets_by_category[acct.category] = assets_by_category.get(acct.category, Decimal(0)) + balance
        else:
            total_liabilities += balance
            liabilities_by_category[acct.category] = liabilities_by_category.get(acct.category, Decimal(0)) + balance

    return total_assets, total_liabilities, assets_by_category, liabilities_by_category, balance_by_type


def _gross_annual_income_at_dataset(dataset: _KpiDataset, as_of: date) -> Decimal:
    return sum(
        (r["income"] for r in dataset.income_records if r["effective_start_date"] <= as_of <= r["effective_end_date"]),
        Decimal(0),
    )


def _transaction_sums_dataset(dataset: _KpiDataset, start: date, end: date) -> dict[str, Decimal]:
    return {
        "income": dataset.txn.window_sum("income", start, end),
        "expense": dataset.txn.window_sum("expense", start, end),
        "housing": dataset.txn.window_sum("housing", start, end),
    }


def _classified_expense_sums_dataset(dataset: _KpiDataset, start: date, end: date) -> dict:
    return {
        "needs": dataset.txn.window_sum("needs", start, end),
        "wants": dataset.txn.window_sum("wants", start, end),
        "savings": dataset.txn.window_sum("savings", start, end),
        "classified_count": dataset.txn.window_sum("classified", start, end),
    }


def _build_kpi_inputs_from_dataset(dataset: _KpiDataset, as_of: date, settings: dict) -> KpiInputs:
    """Pure in-memory computation — identical logic to the old build_kpi_inputs, just reading
    from the pre-fetched dataset instead of issuing a query per lookup."""
    total_assets, total_liabilities, assets_by_category, liabilities_by_category, balance_by_type = (
        _balances_totals_at_dataset(dataset, as_of)
    )

    liquid_types = {t.lower() for t in settings.get("liquid_account_types", [])}
    cash_types = {t.lower() for t in settings.get("cash_account_types", [])}
    liquid_balance = sum((v for k, v in balance_by_type.items() if k.lower() in liquid_types), Decimal(0))
    cash_balance = sum((v for k, v in balance_by_type.items() if k.lower() in cash_types), Decimal(0))

    net_worth = total_assets - total_liabilities

    one_year_ago = as_of - relativedelta(years=1)
    assets_1y, liabilities_1y, _, _, _ = _balances_totals_at_dataset(dataset, one_year_ago)
    net_worth_1y = assets_1y - liabilities_1y

    six_months_ago = as_of - relativedelta(months=6)
    _, liabilities_6mo, _, _, _ = _balances_totals_at_dataset(dataset, six_months_ago)
    liability_reduction_6mo = liabilities_6mo - total_liabilities

    three_months_ago = as_of - relativedelta(months=3)
    _, liabilities_3mo, _, _, _ = _balances_totals_at_dataset(dataset, three_months_ago)
    liability_reduction_3mo = liabilities_3mo - total_liabilities

    property_asset_value = _category_total(assets_by_category, "Property")
    property_liability_value = _category_total(liabilities_by_category, "Property")
    investment_asset_value = _category_total(assets_by_category, "Investment", "Investments")
    retirement_asset_value = _category_total(assets_by_category, "Retirement")

    # Income Growth Rate: average monthly income over the trailing 12 full calendar months
    # vs. average monthly income over the 12 full calendar months before that — a year-over-
    # year raise/growth rate.
    trailing_12mo_values = [
        dataset.monthly_income[key]
        for key in (
            (as_of - relativedelta(months=k)).strftime("%Y-%m") for k in range(1, 13)
        )
        if key in dataset.monthly_income
    ]
    trailing_12mo_avg_income = (
        sum(trailing_12mo_values, Decimal(0)) / len(trailing_12mo_values) if trailing_12mo_values else None
    )
    prior_12mo_values = [
        dataset.monthly_income[key]
        for key in (
            (as_of - relativedelta(months=k)).strftime("%Y-%m") for k in range(13, 25)
        )
        if key in dataset.monthly_income
    ]
    prior_12mo_avg_income = (
        sum(prior_12mo_values, Decimal(0)) / len(prior_12mo_values) if prior_12mo_values else None
    )

    gross_annual_income = _gross_annual_income_at_dataset(dataset, as_of)

    expense_basis = settings.get("expense_basis", "3mo")
    window_months = 12 if expense_basis == "12mo" else 3
    window_start = as_of - relativedelta(months=window_months)
    txn = _transaction_sums_dataset(dataset, window_start, as_of)

    trailing_income = txn["income"]
    if expense_basis == "manual" and settings.get("manual_monthly_expense") is not None:
        trailing_expense = Decimal(str(settings["manual_monthly_expense"])) * window_months
    else:
        trailing_expense = txn["expense"]

    classified = _classified_expense_sums_dataset(dataset, window_start, as_of)
    has_classified = classified["classified_count"] > 0
    needs_trailing = classified["needs"] if has_classified else None
    wants_trailing = classified["wants"] if has_classified else None
    savings_trailing = classified["savings"] if has_classified else None

    # Fixed 12-month window for Savings Efficiency / Net Worth Velocity, independent of the
    # expense_basis-driven trailing window above (matches net_worth_growth_yoy's 1yr compare).
    txn_12mo = _transaction_sums_dataset(dataset, one_year_ago, as_of)
    gross_income_12mo = txn_12mo["income"]
    net_income_12mo = txn_12mo["income"] - txn_12mo["expense"]

    # Last 12 FULL calendar months, excluding the current (partial) month — e.g. as of any day
    # in Aug 2026, this is Aug 2025 through Jul 2026 inclusive. Exactly mirrors the frontend
    # Cash Flow page's own computeRange(12): first day of the month 12 months back through the
    # last day of last month. Used only by Savings Rate / Net Cash Flow, so those two KPIs
    # match that page (and its Sankey) exactly, not just approximately via the rolling
    # 365-day window above.
    as_of_month_start = as_of.replace(day=1)
    full_months_end = as_of_month_start - timedelta(days=1)
    full_months_start = as_of_month_start - relativedelta(months=12)
    txn_full_months = _transaction_sums_dataset(dataset, full_months_start, full_months_end)
    full_months_income = txn_full_months["income"]
    full_months_net_income = txn_full_months["income"] - txn_full_months["expense"]

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
        trailing_12_full_months_income=full_months_income,
        trailing_12_full_months_net_income=full_months_net_income,
        liability_reduction_trailing_3mo=liability_reduction_3mo,
        property_asset_value=property_asset_value,
        property_liability_value=property_liability_value,
        investment_asset_value=investment_asset_value,
        retirement_asset_value=retirement_asset_value,
        trailing_12mo_avg_income=trailing_12mo_avg_income,
        prior_12mo_avg_income=prior_12mo_avg_income,
    )


def build_kpi_inputs_many(
    conn: Connection, household_id: str, as_of_dates: list[date], settings: dict
) -> dict[date, KpiInputs]:
    """Batched entry point — one dataset fetch (a handful of queries total) shared across
    every requested date. Use this instead of calling build_kpi_inputs() in a loop."""
    dataset = _load_kpi_dataset(conn, household_id, as_of_dates)
    return {d: _build_kpi_inputs_from_dataset(dataset, d, settings) for d in as_of_dates}


def build_kpi_inputs(conn: Connection, household_id: str, as_of: date, settings: dict) -> KpiInputs:
    """Single-date convenience wrapper around build_kpi_inputs_many — still issues only a
    handful of queries total (not the old ~8), just for one date instead of many."""
    return build_kpi_inputs_many(conn, household_id, [as_of], settings)[as_of]


def apply_birthdate_age_override(conn: Connection, household_id: str, settings: dict) -> dict:
    """Overrides settings["household_age"] with the live age computed from the household's
    on-file birthdate (users.birthdate_encrypted), when one is set. Birthdate is the source
    of truth for age going forward; the manually-entered household_age setting is only a
    fallback for households that haven't entered a birthdate yet. Shared by both this
    router's build_kpi_inputs and app.routers.settings' GET/PATCH handlers so every surface
    that reads household_age agrees on the same value."""
    row = conn.execute(
        text("select birthdate_encrypted from users where household_id = :household_id"),
        {"household_id": household_id},
    ).mappings().first()
    if row and row["birthdate_encrypted"]:
        birthdate = date.fromisoformat(decrypt_pii(row["birthdate_encrypted"]))
        return {**settings, "household_age": age_from_birthdate(birthdate)}
    return settings


def get_household_settings(conn: Connection, household_id: str) -> dict:
    row = conn.execute(
        text("select settings from household_settings where household_id = :household_id"),
        {"household_id": household_id},
    ).mappings().first()
    settings = merge_with_defaults(row["settings"] if row else {})
    return apply_birthdate_age_override(conn, household_id, settings)


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
        input_rows = [
            KpiInputItem(label=row_label, value=row_value, unit=row_unit)
            for row_label, row_value, row_unit in kpi_service.metric_inputs(slug, inputs)
        ]
        metrics.append(
            KpiMetric(
                slug=slug,
                label=label,
                group=group,
                value=value,
                unit=unit,
                color=color,
                progress_pct=progress_pct,
                inputs=input_rows,
            )
        )

    return ScorecardResponse(as_of=today.isoformat(), metrics=metrics)


_METRIC_FNS = {slug: fn for slug, _, _, _, fn in METRICS}

# Metrics whose progress_pct is the meaningful trend to chart (the dollar target itself barely
# moves month to month). Deliberately an explicit allowlist rather than "any 3-tuple result" —
# net_worth_value also returns a progress_pct now (borrowed from fi_progress's FI number, for
# its own tile's progress bar), but its raw dollar value is still the right thing to chart
# here: net worth genuinely trends over time, unlike a slow-moving target.
_CHART_PROGRESS_PCT_SLUGS = {"target_net_worth"}


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

    cutoffs = [today - relativedelta(months=i) for i in range(months, -1, -1)]
    inputs_by_date = build_kpi_inputs_many(conn, session.household_id, cutoffs, settings)

    points = []
    for cutoff in cutoffs:
        result = fn(inputs_by_date[cutoff])
        value = result[2] if slug in _CHART_PROGRESS_PCT_SLUGS else result[0]
        points.append(KpiHistoryPoint(date=cutoff.isoformat(), value=value))

    return KpiHistoryResponse(slug=slug, points=points)


@router.get("/scorecard/history", response_model=AllKpiHistoryResponse)
def get_all_metric_history(
    months: int = 12,
    end: date | None = None,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> AllKpiHistoryResponse:
    """Batched counterpart to /scorecard/{slug}/history for the tile-embedded sparklines on
    the Scorecard page: build_kpi_inputs_many fetches every underlying table ONCE (not once
    per date, and not once per metric per date) and reuses it for every metric at every
    cutoff — an O(1) query cost instead of O(months) (previously) or O(metrics × months)
    (before that)."""
    settings = get_household_settings(conn, session.household_id)
    today = end or date.today()

    cutoffs = [today - relativedelta(months=i) for i in range(months, -1, -1)]
    inputs_by_date = build_kpi_inputs_many(conn, session.household_id, cutoffs, settings)

    series: dict[str, list[KpiHistoryPoint]] = {slug: [] for slug, _, _, _, _ in METRICS}
    for cutoff in cutoffs:
        inputs = inputs_by_date[cutoff]
        for slug, _, _, _, fn in METRICS:
            result = fn(inputs)
            value = result[2] if slug in _CHART_PROGRESS_PCT_SLUGS else result[0]
            series[slug].append(KpiHistoryPoint(date=cutoff.isoformat(), value=value))

    return AllKpiHistoryResponse(series=series)
