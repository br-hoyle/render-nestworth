# KPI formulas

The Scorecard's 20 tiles (plus 2 more — `needs_ratio`/`wants_ratio` — kept alive purely to
back Cash Flow's needs/wants trend charts, not shown as Scorecard tiles) are implemented as
pure functions in [`backend/app/services/kpi.py`](../backend/app/services/kpi.py),
unit-tested in [`backend/tests/test_kpi.py`](../backend/tests/test_kpi.py). The
data-fetching that builds their inputs lives in
[`backend/app/routers/scorecard.py`](../backend/app/routers/scorecard.py)
(`build_kpi_inputs`). Thresholds are household-configurable, stored in
`household_settings.settings.kpi_thresholds` (defaults in
[`backend/app/schemas/settings.py`](../backend/app/schemas/settings.py)) and editable from
each tile's detail panel on the Scorecard screen — that JSONB blob is the single source of
truth, so a threshold change re-colors the metric everywhere it's shown (Overview tiles,
full Scorecard, mobile). A "neutral" color (grey dot) is used for a handful of purely
informational dollar figures with no natural good/bad direction — see Total Debt and the
two Future Balance projections below.

Household-wide inputs used across several metrics:

- **Liquid balance** — sum of open asset accounts whose `account_type` is in
  `liquid_account_types` (default: Checking, Savings — editable per household).
- **Cash balance** — sum of open asset accounts whose `account_type` is in
  `cash_account_types` (default: same as liquid, but this is a separate, narrower list).
- **Expense basis** (`expense_basis`: `3mo` | `12mo` | `manual`) — the trailing window used
  for "monthly expense" everywhere below. `3mo`/`12mo` sum actual expense transactions over
  that window; `manual` uses a household-entered `manual_monthly_expense` figure instead
  (useful before any CSV has been imported).
- **Trailing income** — actual income-type transactions summed over the same trailing
  window (i.e. real banked income, not the on-paper effective-dated `income` table). This
  is what "net income" means everywhere below, as distinct from **gross annual income**
  (the effective-dated table, annualized).
- **Property / Investment / Retirement asset & liability values** — accounts are summed by
  their `category` column household-wide (e.g. every Property-category liability across
  every mortgage, HELOC, and secondary property is summed together) — multiple properties
  or investment accounts aren't tracked separately.

## Liquidity & Emergency Reserves

**Emergency Fund** (`months`) — `cash balance ÷ average monthly "needs" expense`. The
narrowest, most conservative liquidity read: cash only, essentials only. Falls back to
overall trailing expense until the household classifies transactions as needs/wants.
Thresholds: red `< 3` months, green `≥ 6` months.

**Liquid Runway** (`months`) — `liquid balance ÷ average monthly TOTAL expense`. Broader
than Emergency Fund on both sides — every liquid account, every expense dollar (not just
needs). Thresholds: red `< 3` months, green `≥ 6` months.

**Liquidity Ratio** (`ratio`) — `liquid balance ÷ average monthly total expense`.
Deliberately the same numerator and denominator as Liquid Runway — this is the identical
underlying figure shown as a unitless ratio instead of a month count, for a quick
above/below-1.0x read rather than a duplicate signal. Thresholds: red `< 0.5`, green `≥ 1.0`.

## Debt & Leverage Management

**Total Debt** (`dollars`) — sum of every liability account balance. Informational only
(neutral color) — there's no household-size-independent threshold for an absolute total.
The household's goal for this figure is $0. %-to-goal has no natural non-zero denominator
to divide by (target ÷ value and value ÷ target both degenerate at target=0), so it's
computed frontend-side, relative to the metric's own trailing-12-month history instead:
`(oldest charted value − current) ÷ oldest charted value × 100` — i.e. % reduction over the
charted window, toward the $0 goal, rather than a ratio against a fixed threshold. See
`targetInfoFor` in `frontend/lib/kpiThresholds.ts`.

**Total Non-Property Debt** (`dollars`) — `total liabilities − property-category
liabilities` (mortgages, HELOCs, secondary property loans, etc. excluded). The debt that
isn't secured by a home's value, so it reads as the more urgent payoff target. Same $0-goal,
history-relative %-to-goal treatment as Total Debt.

**Debt to Income (DTI)** (`percent`) — estimated monthly debt payment ÷ monthly gross
income × 100. **Documented simplification**: the schema has no loan-payment/APR/term
field, so the "payment" is estimated as the trailing 3-month average pace of total-liability
paydown (`(liabilities 3 months ago − liabilities now) ÷ 3`). This only produces a number
when debt is actually shrinking — flat or growing balances mean there's no paydown pace to
infer a payment from, so the metric reports unavailable (red) rather than a misleading 0%
or negative figure. Debt-free households show `0%`/green outright. Thresholds: green
`< 36%`, red `≥ 43%` (the classic mortgage-underwriting bands, now more literally
applicable than the previous balance-based proxy).

**Debt to Assets** (`percent`) — `total liabilities ÷ total assets × 100`. A pure
balance-sheet leverage ratio with no income dependency. Thresholds: green `< 30%`, red
`≥ 50%`.

**Housing Debt to Equity** (`percent`) — `property-category liabilities ÷ property-category
home equity × 100`, where equity = property assets − property liabilities. Returns
"not applicable" (neutral) when no property is tracked at all, and "unavailable" (red) when
underwater (equity ≤ 0) or when a liability exists with no matching property asset — the
ratio is undefined/unbounded in both cases rather than a finite percentage worth showing.
Thresholds: green `< 100%`, red `≥ 300%` — a fresh mortgage starts highly leveraged and
should trend down as equity builds. The household's goal for this ratio is 0% (fully paid
off, or equity fully covering the mortgage) — like Total Debt above, %-to-goal is computed
history-relative rather than as a ratio against a fixed threshold, since dividing by a
target of 0 degenerates.

**Debt Payoff Runway** (`months`) — `total liability balance ÷ average monthly principal
reduction over the trailing 6 months`. Returns "no data" (red) if liabilities haven't
shrunk in that window. Thresholds: green `≤ 36` months, yellow `≤ 84` months, red beyond.

## Cash Flow & Budgeting Efficiency

**Savings Rate** (`percent`) — `(trailing income − trailing expense) ÷ trailing income ×
100`. Thresholds: red `< 5%`, green `≥ 15%`.

**Net Cash Flow** (`dollars`) — `trailing income − trailing expense`. The dollar-amount
counterpart to Savings Rate. Green if non-negative, coral if negative. Goal is 15% of
income, expressed as a dollar figure: `trailing income × 0.15`. Trailing income isn't a
value the frontend has directly, so it's derived from the Savings Rate sibling metric
(`net_cash_flow.value ÷ (savings_rate.value ÷ 100)`) rather than adding a new backend field
— the same "borrow from a sibling metric" approach Net Worth uses for its own target.

**Discretionary Spending Rate** (`percent`) — `trailing "wants"-classified expense ÷
trailing income × 100`. `null` until transactions are classified. Thresholds: green `< 30%`,
red `≥ 45%`.

**Housing Cost Ratio** (`percent`) — `average monthly housing expense ÷ monthly trailing
(net) income × 100`. Housing expense is summed from transactions where `Group`/`Item`
matches "housing" or "mortgage" (case-insensitive). **Note**: this is evaluated against
NET income (actual banked income transactions), not gross — it will read higher than a
gross-income version of the same housing cost, since net < gross. The 28/36 thresholds
carried over from the prior gross-income version are a starting point, not a recalibrated
figure; adjust per household if that calibration doesn't fit. Thresholds: green `< 28%`,
red `≥ 36%`.

**Net Income Rate** (`percent`) — `trailing net income ÷ trailing gross income (annualized,
held flat over the window) × 100` — the share of on-paper pay that actually shows up as
banked income. Thresholds: red `< 50%`, green `≥ 70%`.

**Income Growth Rate** (`percent`) — `this calendar month's actual income transactions ÷
average of the 12 full calendar months before it × 100`. A "pace vs. trailing average"
reading (100% = right on pace), the same convention Cash Flow's Category Drift chart uses
for expenses. Returns `null` until 12 full prior months of transaction history exist.
Thresholds: red `< 90%`, green `≥ 105%`.

**Savings Efficiency** (`percent`) — `(net worth now − net worth 1 year ago) ÷ gross income
over the same trailing 12 months × 100`. Answers "how much of every earned dollar actually
stayed on the balance sheet," distinct from Savings Rate's cash-flow-only view (this one
reflects market/valuation movement too). Thresholds: green `≥ 20%`, red `< 0%`.

## Wealth Accumulation & Balance Sheet Health

**Net Worth** (`dollars`) — total assets minus total liabilities, as of today. Color is
sign-based (green if non-negative, coral if negative) — a solvency read, unrelated to
progress toward any target. The tile's progress bar and %-to-target instead show
`net worth ÷ FI number × 100` (the same FI number Target Net Worth targets) — this moved
here from Target Net Worth's tile per the household's explicit request, since Net Worth is
the figure that's actually progressing.

**Net Worth Velocity** (`percent`) — `(net worth now − net worth 1 year ago) ÷ net income
(income − expense) over the same trailing 12 months × 100`. Above 100% means net worth grew
by more than take-home cash flow alone would explain. Thresholds: green `≥ 100%`, red `< 0%`.

**Target Net Worth** (`dollars`, slug `fi_progress`) — no longer shown as its own Scorecard
tile (removed per the household's explicit request), but still computed backend-side: the
FI number itself, `(average monthly expense × 12) ÷ withdrawal rate` (the standard "25×
annual expenses" at a 4% withdrawal rate, overridable via `fi_number_override`), is Net
Worth's borrowed target (see above). Still shown on Overview under this name. Withdrawal
rate (`fi_withdrawal_rate`, default 4%) no longer has a UI surface to edit it now that the
tile is gone — still settable via `PATCH /settings` directly if it ever needs tuning away
from the 4% default.

Asset allocation by category/type is shown directly on Overview (a sunburst chart) rather
than as a scored KPI.

## Retirement & Financial Independence

**Financial Independence** (`dollars`, slug `target_net_worth`) — the net worth a household
"should" have today if they'd saved a fixed share of income every month from age 20 onward,
growing at a fixed annualized return: a future-value-of-an-annuity projection, distinct
from Target Net Worth's expense-based approach above. Requires `household_age`,
`target_net_worth_savings_rate` (default 15%), and `target_net_worth_roi` (default 7%),
editable from the tile's detail panel; returns `null` until `household_age` is set. Progress
bar shows `net worth ÷ target × 100`. Green at `≥ 100%` progress, yellow `≥ 50%`, red below.

`household_age` is derived automatically from the birthdate set on the Settings page
(`users.birthdate_encrypted`, see `app.routers.scorecard.apply_birthdate_age_override`) —
it's no longer a directly-editable per-metric assumption. A household that hasn't entered a
birthdate yet falls back to a manually-entered `household_age` setting value (legacy, kept
for backward compatibility, but there's no UI to set it anymore other than the API itself).

**Future Investment Balance** (`dollars`) — the current Investment-category asset balance,
compounded monthly at `expected_return_rate` (default 10%) with `monthly_investment_
contribution` (default $0) added each month, from `household_age` to
`target_retirement_age` (default 65). Neutral color (a projection, not a graded metric).
Returns `null` until both ages are configured — there's no other "years to retirement"
figure anywhere in the schema (Scenarios, which would have held this, were removed).

**Future Retirement Balance** (`dollars`) — identical mechanics to Future Investment
Balance, but starting from the current Retirement-category asset balance and
`monthly_retirement_contribution` (default $0). Shares `household_age`,
`target_retirement_age`, and `expected_return_rate` with Future Investment Balance — editing
either tile's assumptions updates both.

## Transaction classification (`transaction_categories`)

Several metrics above (Emergency Fund's needs fallback, Discretionary Spending Rate, and
Cash Flow's own needs/wants trend charts) depend on the household mapping transaction
`group`/`item` pairs to a `needs` / `wants` / `savings` / `transfer` / `other` flow type
(Transactions page → unclassified banner → Classify screen). A group-level rule (`item =
''`) applies to every item under that group unless a more specific group+item rule exists.
Until classified, the affected metrics return `null` rather than a misleading zero.

## History

Every registered metric supports `GET /scorecard/{slug}/history?months=N` — the same
formula recomputed at each of the last N month-end dates, so the detail panel can show a
real trend line with threshold bands, not just the current value.
