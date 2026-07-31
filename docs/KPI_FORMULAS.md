# KPI formulas

All 19 metrics (the original 11 plus 8 added in the backlog-pass-2 batch) are implemented
as pure functions in
[`backend/app/services/kpi.py`](../backend/app/services/kpi.py), unit-tested in
[`backend/tests/test_kpi.py`](../backend/tests/test_kpi.py). The data-fetching that builds
their inputs lives in [`backend/app/routers/scorecard.py`](../backend/app/routers/scorecard.py)
(`build_kpi_inputs`). Thresholds are household-configurable, stored in
`household_settings.settings.kpi_thresholds` (defaults in
[`backend/app/schemas/settings.py`](../backend/app/schemas/settings.py)) and editable from
each tile's detail panel on the Scorecard screen — that JSONB blob is the single source of
truth, so a threshold change re-colors the metric everywhere it's shown (Overview tiles,
full Scorecard, mobile).

Household-wide inputs used across several metrics:

- **Liquid balance** — sum of open asset accounts whose `account_type` is in
  `liquid_account_types` (default: Checking, Savings — editable per household).
- **Cash balance** — sum of open asset accounts whose `account_type` is in
  `cash_account_types` (default: same as liquid, but this is a separate, narrower list used
  only by Liquidity ratio — see below).
- **Expense basis** (`expense_basis`: `3mo` | `12mo` | `manual`) — the trailing window used
  for "monthly expense" in Safety/Growth ratios. `3mo`/`12mo` sum actual expense
  transactions over that window; `manual` uses a household-entered `manual_monthly_expense`
  figure instead (useful before any CSV has been imported).

## Safety

**Emergency fund** (`months`) — `liquid balance ÷ average monthly expense` (expense basis
above). Thresholds: red `< 3` months, green `≥ 6` months (yellow between).

**Liquidity ratio** (`ratio`) — `cash balance ÷ average monthly expense`. Deliberately
narrower than Emergency fund (cash accounts only, not the full configurable liquid set) so
it reads as a stricter, secondary signal rather than duplicating the same number. Thresholds:
red `< 0.5`, green `≥ 1.0`.

**Housing cost ratio** (`percent`) — `average monthly housing expense ÷ gross monthly
income × 100`. Housing expense is summed from transactions where the `Group` or `Item`
column matches "housing" or "mortgage" (case-insensitive). This is the classic 28/36-rule
front-end ratio. Thresholds: green `< 28%`, red `≥ 36%`.

## Growth

**Savings rate** (`percent`) — `(income − expense) ÷ income × 100` over the expense-basis
window, from transactions. Thresholds: red `< 5%`, green `≥ 15%`.

**Net worth growth (YoY)** (`percent`) — `(net worth now − net worth 1 year ago) ÷
|net worth 1 year ago| × 100`. Green if non-negative, coral (a warning color, not a strict
"red" threshold) if negative — trend direction matters more than a fixed band here.

**FI progress** (`percent`) — `net worth ÷ FI number × 100`. FI number defaults to
`(average monthly expense × 12) ÷ withdrawal rate` (the standard "25× annual expenses" at a
4% withdrawal rate), overridable directly via `fi_number_override`. Green at `≥ 100%`
(financially independent), yellow `≥ 50%`, red below that.

## Debt & mix

**Debt-to-income** (`percent`) — `total liability balance ÷ gross annual income × 100`.
**Documented simplification**: this is a stock-to-flow ratio (total debt balance, not a
monthly required-payment ratio), because the schema has no loan-payment field to compute the
latter. It keeps the classic 36/43 thresholds as directional guidance, not a strict
underwriting calculation. Thresholds: green `< 36%`, red `≥ 43%`.

**Debt payoff runway** (`months`) — `total liability balance ÷ average monthly principal
reduction over the trailing 6 months`. If liabilities haven't shrunk in that window (paying
interest-only or growing), this returns "no data" (red) rather than a misleading number.
Thresholds: green `≤ 36` months, yellow `≤ 84` months, red beyond that.

**Net worth** (`dollars`) — total assets minus total liabilities, as of today. Green if
non-negative, coral if negative.

Asset allocation by category/type is shown directly on Overview (a sunburst chart built
from live account balances) rather than as a scored KPI.

## Efficiency (added in backlog pass 2)

**Debt-to-assets** (`percent`) — `total liabilities ÷ total assets × 100`. Lower is better;
green `< 30%`, red `≥ 50%`. Unlike debt-to-income, this is a pure balance-sheet ratio (no
income dependency), so it stays meaningful even for a household with irregular income.

**Capital deployment rate** (`percent`) — `(needs/wants/savings-classified "savings" flow
transactions) ÷ (trailing income − trailing expense) × 100`. Requires the household to have
classified at least one transaction via `transaction_categories`; returns "not classified
yet" (gray/`None`) otherwise rather than a misleading zero. Green `≥ 20%`, red `< 10%`.

**Liquid runway** (`months`) — `liquid balance ÷ average monthly "needs" expense`. Falls back
to overall trailing expense (same basis as Emergency fund) if the household hasn't
classified transactions yet — documented fallback, not silently wrong. Green `≥ 6` months,
red `< 3`.

**Savings efficiency** (Wealth Retention Rate, `percent`) — `(net worth now − net worth 1
year ago) ÷ gross income over the same trailing 12 months × 100`. Answers "how much of every
earned dollar actually stayed on the balance sheet." Green `≥ 20%`, red `< 0%`.

**Net worth velocity** (`percent`) — `(net worth now − net worth 1 year ago) ÷ net income
(income − expense) over the same trailing 12 months × 100`. A value above 100% means net
worth grew by more than take-home cash flow alone would explain (investment growth is
pulling its weight); green `≥ 100%`, red `< 0%`.

## Budget rule — 50/30/20 (added in backlog pass 2)

**Needs / Wants / Savings ratios** (`percent` each) — trailing `needs`/`wants`/`savings`
flow-type transaction sums (from `transaction_categories`) ÷ trailing income × 100. These
are *banded around a target* rather than monotonically better/worse: `needs_ratio` targets
50%, `wants_ratio` targets 30%, `savings_ratio` targets 20%, each green within a few points of
target, red the further off in *either* direction (see `color_for_target` in `kpi.py`) — a
15%-needs household isn't "great", it likely means the classification is incomplete. Shown
together with dashed target lines on the Scorecard's dedicated `BudgetRuleChart`.

## Transaction classification (`transaction_categories`)

The five metrics above all depend on the household mapping transaction `group`/`item` pairs
to a `needs` / `wants` / `savings` / `transfer` / `other` flow type (Transactions page →
unclassified banner → Classify screen). A group-level rule (`item = ''`) applies to every
item under that group unless a more specific group+item rule exists. Until classified, the
affected metrics return `null` rather than a misleading zero.

## History

Every registered metric supports `GET /scorecard/{slug}/history?months=N` — the same formula
recomputed at each of the last N month-end dates, so the detail panel can show a real trend
line with threshold bands, not just the current value.
