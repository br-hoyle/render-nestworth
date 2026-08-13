"""
Shared rule for what counts as a real cash-flow expense/income, used by both the KPI
dataset builder (routers/scorecard.py) and the Cash Flow page's own endpoints
(routers/cashflow.py).

Transactions filed under the "Savings & Investments" EveryDollar group are transfers into
asset-building accounts (brokerage, retirement, a savings sweep) — money that is still on
the household's balance sheet, not spent. Counting them as an "expense" understates net
income, savings rate, and net worth velocity, and previously made Net Worth Velocity's
"is net worth growing faster than take-home cash flow explains" reading unanswerable
whenever the household's actual savings/investment contributions outweighed its other
cash flow (see docs/KPI_FORMULAS.md). This rule excludes the whole group — both sides,
though in practice everything filed here is an expense-type row — from every cash-flow
aggregate, the same way the household's own instructions describe it: ignored entirely,
not miscounted as spending.
"""

EXCLUDED_CASHFLOW_GROUP = "savings & investments"


def is_excluded_cashflow_group(group: str | None) -> bool:
    return (group or "").strip().lower() == EXCLUDED_CASHFLOW_GROUP
