# KPI formulas

All 11 metrics are implemented as pure functions in
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

**Retirement contribution rate** (`percent`) — annualized retirement-tagged expense
transactions (`Group` ILIKE `%retirement%`) ÷ gross annual income. **Documented
simplification**: the schema has no dedicated "this is a retirement contribution" flag, so
this is a heuristic based on how transactions happen to be categorized in the imported CSV.
A household can override it directly with `retirement_contribution_rate_override` in
Settings if they don't tag contributions that way. Thresholds: red `< 5%`, green `≥ 15%`.

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

**Allocation mix** (`mix`, not a single value) — each asset category's share of total
assets, e.g. `{"Banking": 21, "Investments": 54, "Retirement": 25}`. Feeds the allocation
donut on Overview and the Scorecard.

## History

Each metric (except Allocation mix) supports `GET /scorecard/{slug}/history?months=N` —
the same formula recomputed at each of the last N month-end dates, so the detail panel can
show a real trend line with threshold bands, not just the current value.
