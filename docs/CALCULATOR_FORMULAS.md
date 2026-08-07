# Calculator formulas

Documents every calculator across all three sections of
[`frontend/app/(app)/plan/calculators/page.tsx`](../frontend/app/(app)/plan/calculators/page.tsx)
(Retirement & Investment, Debt & Payment, Housing & Mortgage), same audit-friendly spirit as
[KPI_FORMULAS.md](./KPI_FORMULAS.md) — these are real financial projections a household may act
on, so the math and its simplifications are spelled out here rather than left implicit. Each
calculator's pure math lives in its own module under
[`backend/app/services/calculators/`](../backend/app/services/calculators/), unit-tested in
[`backend/tests/test_calculators.py`](../backend/tests/test_calculators.py). A shared bisection
helper (`_solve.py`) backs every "solve for X given the rest" calculator in the Retirement &
Investment section; `_frequency.py` defines the compounding-frequency vocabulary shared across
sections; `_annuity.py` generalizes the level-payment formula to arbitrary compounding/payback
frequencies for Debt & Payment; `_amortization.py` and `_costs.py` do the same job for Housing &
Mortgage (a configurable-frequency amortization loop with three optional extra-payment types,
and an "amount or percent" resolver for cost fields that can be quoted either way).

## Retirement Calculator

Four sub-tabs, each solving a different question — distinct from `financial_independence.py`'s
simpler "25x expenses" rule, since these are age/lifespan-aware and (for two of the four)
solve backward for an unknown instead of just projecting forward.

**How much do you need to retire** (`retirement_need.py`) — projects today's income forward at
the assumed annual increase to estimate income at retirement, sizes a target nest egg as the
present value of an annuity that replaces a chosen % of that income for every year of expected
retirement (at the *real*, inflation-adjusted return — `(1+return)/(1+inflation) - 1`), nets
out any other monthly income (e.g. Social Security), and compares that target against where
current savings are projected to land on their own. If short, solves for the extra monthly
savings needed to close the gap by retirement age (future-value-of-annuity inversion).

**How can you save for retirement** (`retirement_savings_plan.py`) — solves for the fixed
monthly contribution needed to reach a target balance by retirement age, given what's already
saved: a direct future-value-of-annuity inversion (closed-form when the return is nonzero).

**How much can you withdraw** (`retirement_withdrawal.py`) — accumulates current savings plus
contributions to retirement age, then solves for the fixed monthly withdrawal — held level in
*today's* purchasing power, i.e. computed against the real return — that exactly depletes the
balance by life expectancy. Reuses `mortgage.monthly_payment`'s annuity-payment formula
directly: paying a balance down to zero over N years at a fixed rate is the same math whether
the "balance" is a loan or a nest egg.

**How long will your money last** (`retirement_longevity.py`) — simulates a fixed monthly
withdrawal against a starting balance until it depletes, or confirms it lasts indefinitely
(withdrawal below what the return alone replenishes each month). 1200-month (100-year) safety
cap, matching the iteration-cap convention used elsewhere (`mortgage.py`, `debt_payoff.py`).

## Investment Calculator

One engine (`investment.py`), three "solve for X" tabs — **End Amount**, **Contributions**,
**Investment Length** — replacing the old registry aliases that all pointed at the same plain
compound-growth math with no way to solve backward. Supports a configurable compounding
frequency and whether contributions land at the start or end of each period. Everything is
expressed in whole periods at the chosen frequency (`n = term_years × periods_per_year`), so
End Amount and Contributions solve directly via the future-value-of-annuity formula; Investment
Length bisects over an integer period count (a fractional period doesn't make sense here).

## 401(k) Calculator

`k401.py` — accumulation phase: salary grows annually at the assumed rate; the employee
contributes a flat % of salary; the employer matches up to a limit %. Drawdown: this
calculator's spec has no explicit withdrawal-rate input (unlike the standalone Retirement
Withdrawal calculator), so the reported "sustainable monthly income" uses the same
real-annuity-payment approach as `retirement_withdrawal.py` — the fixed real monthly payment
that exactly depletes the balance by life expectancy. Documented here as the assumption, since a
raw balance-at-retirement figure with no sense of "how long that lasts" is less actionable.

## 401(k) Match Maximizer

`k401_match_maximizer.py` — employer matches are usually tiered ("100% of the first 3%, 50% of
the next 2%"). Under-contributing misses the tiers; over-contributing (as a % of a high salary)
can hit the IRS annual employee-deferral limit before year-end, cutting off matching for the
rest of the year even though the % was technically enough. Finds the contribution-%
window — from the cumulative % needed to capture both tiers, up to the % that would front-load
the (documented, simplified constant) IRS limit — that captures the full match safely. Tiers
are treated as cumulative (tier 2's limit is the *total* % needed for both tiers), the most
common real-world structure.

## Roth IRA Calculator

`roth_ira.py` — after-tax contributions (capped at the documented, simplified `ANNUAL_LIMIT`
constant — the real IRS limit changes yearly and is shared across Roth+Traditional
contributions in combination, not modeled here), tax-free growth. Compared side-by-side against
an equivalent taxable brokerage account: same contributions, but each year's investment *gains*
are taxed at the household's marginal rate before compounding forward — a standard, simplified
way to show the Roth's tax-free-growth advantage in dollars rather than just in theory.

## Compound Interest Calculator

`compound_interest_converter.py` — **not** a growth projector (that's the Investment
Calculator). Converts a nominal rate quoted at one compounding frequency into the equivalent
nominal rate at any other, via the effective-annual-rate bridge:

```
effective_annual = (1 + nominal/n)^n - 1                (or e^nominal - 1 for continuous)
output_nominal    = n_out × ((1+effective_annual)^(1/n_out) - 1)   (or ln(1+effective_annual) for continuous)
```

Useful for comparing, e.g., "5% compounded monthly" against "5% compounded annually" — not the
same rate. Also returns a full comparison table across every supported frequency.

## Interest Rate Calculator

`interest_rate_solver.py` — solves for the annual rate implied by a principal, term (years +
months), and target monthly payment, via 60-iteration binary search over the standard
amortization-payment formula (closed-form inversion isn't practical). Unchanged math from the
original backlog-pass-2 version; only the term input now accepts years + months instead of
whole years.

## Savings Calculator

`savings.py` — a real savings-account simulator, distinct from the Investment Calculator's
generic growth engine: separate annual and monthly contributions, each escalating at its own
rate (a raise might bump one but not the other), a configurable compound frequency, and tax
applied to interest as it's earned (a taxable account, not a tax-advantaged one). Simulated
monthly (the finest granularity any input needs); interest is credited — and taxed — only at
the chosen compounding frequency's boundaries, not every month.

## Debt & Payment

Five calculators, covering both sides of borrowing math — sizing/pricing a loan (Loan,
Payment, Repayment) and paying down what's already owed (Debt Payoff, Debt Consolidation). A
shared `_annuity.py` module backs the first three: `effective_period_rate` bridges a nominal
annual rate stated at one compounding frequency to the effective rate for a (possibly
different) payback frequency, `annuity_payment` is a frequency-agnostic generalization of
`mortgage.monthly_payment`'s level-payment formula, and `periods_for_payment` closed-form
inverts it (via `Decimal.ln()`) to solve for how many periods a fixed payment takes — no
bisection needed here, unlike the Retirement & Investment section's `_solve.py` helper.

### Loan Calculator

`loan_calculator.py` — three tabs framing a fixed sum being borrowed or owed, matching
calculator.net's layout. The `principal` field is reused across all three with a different
meaning per tab (mirroring `investment.py`'s shared-field convention): the amount borrowed for
Amortized/Deferred, but the amount predetermined to be due at maturity for Bond.

- **Amortized** — a standard loan paid down with level periodic payments. Compound frequency
  and payback frequency are independently configurable (e.g. "compounded monthly, paid
  biweekly"); `effective_period_rate` bridges the two before `annuity_payment` sizes the
  payment. Yearly schedule tracks principal/interest/balance, same shape as `mortgage.py`'s.
- **Deferred** — nothing is paid until maturity, when the full accrued balance comes due at
  once: `amount_due = principal × (1 + rate/n)^(term_years × n)`, the plain compound-growth
  formula with no periodic payments to solve for.
- **Bond** — the mirror image of Deferred: given a fixed amount due at maturity (`principal`
  here means that future amount, not money borrowed today), solves for its present value —
  `initial_value = face_value / (1 + rate/n)^(term_years × n)`.

### Payment Calculator

`payment_calculator.py` — the simplest of the three, monthly-only (no compound/payback
frequency inputs, unlike Loan/Repayment) to match the spec's lighter-weight tool.

- **Fixed Term** — given amount, rate, and term, `annuity_payment` finds the monthly payment.
- **Fixed Payments** — given amount, rate, and what you can pay monthly, `periods_for_payment`
  solves for the payoff time (rounded up to a whole month via `ROUND_CEILING`, since a partial
  final month still requires a payment). Returns an explicit error rather than a runaway result
  if the payment doesn't even cover the first period's interest.

### Repayment Calculator

`repayment_calculator.py` — same two "solve for the missing piece" modes as Payment, but framed
for an existing balance rather than a fresh loan, with independently configurable compound and
payback frequencies (via `effective_period_rate`, exactly as in Loan's Amortized tab).

- **Fixed Time** — given a balance, rate, and a term (years + extra months), finds the
  per-period payment via `annuity_payment`.
- **Fixed Installment** — given a balance, rate, and a fixed payment per period, finds how many
  periods it takes via `periods_for_payment`.

### Debt Payoff Calculator

`debt_payoff_avalanche.py` — pays down a table of debts using the **avalanche** method (highest
interest rate first), the cost-efficient order from a pure-interest standpoint; replaces the
prior single-debt `debt_payoff.py` and the avalanche-vs-snowball `debt_acceleration.py`; this
spec calls for avalanche specifically plus a fixed-total-payment option, not a strategy
comparison. Simulated month-by-month (1200-month/100-year safety cap, matching the
`mortgage.py`/prior `debt_payoff.py` convention):

- Each month, every debt accrues interest on its current balance at `annual_rate / 12` and pays
  at least its minimum.
- An optional **extra payment** — monthly, or a once-a-year lump sum (e.g. a tax refund) —
  always goes to the highest-priority (highest-rate) debt with a remaining balance, on top of
  minimums.
- The **fixed total payment** toggle controls what happens once a debt is paid off: *on*
  redirects its freed-up minimum to the next-priority debt, keeping the household's total
  monthly outlay constant until everything is paid off (the standard "debt snowball/avalanche"
  behavior); *off* lets the total monthly outlay shrink as each debt disappears, with each
  remaining debt still only receiving its own minimum. Within a month, any payment that exceeds
  a debt's remaining balance always cascades to the next-priority debt regardless of the
  toggle — the toggle only governs what happens to freed-up money in *future* months.
- Reports months/years to debt-free (or `null`/"lasts indefinitely" if the 1200-month cap is
  hit — minimums don't cover the combined interest), total interest paid, the avalanche payoff
  order, the payoff month per debt, and a yearly total-balance schedule for the chart.

### Debt Consolidation Calculator

`debt_consolidation.py` — compares a table of existing debts (balance, rate, current monthly
payment) against rolling them all into one new consolidation loan at a blended rate and new
term. Blended current rate is balance-weighted across the existing debts; the new payment uses
`mortgage.monthly_payment` on the summed balance. A one-time **loan origination fee** is folded
into a `new_total_cost_including_fee` figure (`new_payment × new_term_years × 12 + fee`) rather
than amortized into the monthly payment, since origination fees are typically paid up front or
rolled into the balance rather than spread across payments.

## Housing & Mortgage

Six calculators. `_amortization.py`'s `amortize()` is the shared engine behind four of them
(Mortgage, Amortization, Mortgage Payoff, Rent vs. Buy): a periodic amortization loop at any
payments-per-year frequency, with three independent optional extra-payment types (a recurring
monthly-cadence extra, a recurring yearly-cadence extra, and a single one-time extra) that can
combine freely. `_costs.resolve_annual()` resolves an "amount or percent" cost field (down
payment, property tax, home insurance, PMI, HOA, other costs) into a concrete annual dollar
figure given a base (home price) — used by Mortgage, House Affordability, and Rent vs. Buy
wherever the spec allows a cost to be quoted either way.

### Mortgage Calculator

`mortgage.py` — the full monthly cost of owning a home, not just principal & interest: property
tax, home insurance, PMI, HOA fees, and other recurring costs, each entered as a flat annual
dollar amount or a percentage of home price per year. PMI is included only when the down payment
is under 20% of the home price (the standard trigger for requiring it) but, once included, is
modeled as a flat recurring cost for the life of the loan rather than auto-cancelling once
paydown reaches 20% equity — real mortgages typically do cancel it at that point, but the
spec's PMI input has no cancellation rule specified, so this keeps the assumption simple and
explicit rather than adding unrequested behavior. `monthly_payment()` and `_add_months()` are
also imported directly by `refinance.py` and `debt_consolidation.py`.

### Amortization Calculator

`amortization.py` — a full amortization schedule with three optional, independent, and
combinable extra-payment types: a recurring extra every month (from a chosen start month), a
recurring extra once a year (from a chosen start month), and a single one-time extra (in a
chosen month). Compares the result against the same loan with no extras to report interest and
time saved. Replaces the previous registry-only relabel of the generic amortized-loan math
(`loan.py`, now retired) — this calculator's whole point is the extra-payment scenarios that
math never modeled.

### Mortgage Payoff Calculator

`mortgage_payoff.py` — for a loan already in progress: replays the original loan's amortization
schedule up to today (elapsed time = original term − remaining term) to find the current
balance, then compares four ways to finish paying it off — pay off the balance today (no more
interest), continue at the original payment plus optional extra payments (reusing the
Amortization Calculator's engine), switch to biweekly payments (half the monthly payment every
two weeks — 26 payments/year, the equivalent of 13 monthly payments/year, modeled by re-running
the engine at `payments_per_year=26` with interest accruing at `annual_rate/26` per period — an
approximation, since real biweekly billing cycles don't line up with exact 1/26-year periods,
but the same simplification calculator.net's version uses), or continue exactly on the original
schedule (the baseline every other option is compared against).

### House Affordability Calculator

`house_affordability.py` — two modes, both solved in closed form (no bisection needed) because
the unknown being solved for — home price — cancels out algebraically whether costs are
percent-of-price or flat dollar amounts:

- **Income to Debt** — sizes price from gross income and a debt-to-income ratio preset:
  Conventional (28% front-end / 36% back-end), FHA (31%/43%), VA (approximated here as
  "unconstrained front-end, 41% back-end" — VA underwriting has no standalone front-end ratio in
  practice, instead evaluating residual income, so this is a simplification), or a custom
  back-end-only ratio.
  Total monthly debt is not covered by the down payment; the maximum PITI, minus the tax/
  insurance/HOA escrow figured on the price being solved for, is what leaves the top of the
  price equation.
- **Fixed Monthly Budget** — solves for the price a chosen total monthly housing budget affords
  instead, with no income or DTI involved; maintenance is always a flat dollar amount per the
  spec, while property tax/HOA/insurance may each independently be percent or flat.

### Refinance Calculator

`refinance.py` — unlike the original version, the current loan's remaining term isn't asked for
directly (households rarely know that number precisely); instead it's derived from the balance,
rate, and current monthly payment already on a statement, via `_annuity.periods_for_payment` (the
same closed-form inversion the Debt & Payment section's Repayment Calculator uses). **New Loan
Points** (a percentage of the new loan amount, paid upfront to secure the quoted rate) and **New
Loan Costs & Fees** (a flat dollar amount) are folded into a single upfront-cost figure for the
breakeven calculation. A **Cash Out Amount** is added directly to the new loan's principal and
nets against the upfront cost, since receiving cash offsets what refinancing costs.

### Rent vs. Buy Calculator

`rent_vs_buy.py` — the most involved calculator in the app: simulates home ownership and renting
side by side over a chosen comparison horizon (a "years to compare" input the spec implies but
doesn't name outright — without it the comparison has no endpoint) and reports which one leaves
the household better off, using the standard "invest the difference" framing rather than simply
comparing monthly payments:

- Each year, whichever option costs less is assumed to have its savings invested at the given
  average investment return; the running, compounded gap between the two options' costs is the
  final answer. Positive means renting-and-investing-the-difference wins by that amount (in
  future dollars at the end of the horizon); negative means buying wins by that amount.
- **Buy side**: P&I via `_amortization.amortize()` (stopping once the loan is paid off — if that
  happens before the horizon ends, only escrow costs continue for the remaining years); property
  tax escalates at its own annual rate, independent of home appreciation (a mill-rate-style
  increase rather than tied to the home's assessed value); home insurance/HOA/maintenance share
  the spec's single "costs increase" rate. Closing costs are a one-time upfront % of home price;
  selling closing costs are a one-time % of the home's appreciated value, charged only when
  computing sale proceeds at the end of the horizon.
- **Tax treatment**: assumes the household itemizes only when mortgage interest + property tax
  paid that year exceeds the standard deduction for their filing status (`STANDARD_DEDUCTION` —
  approximate, single-tax-year constants, the same "documented simplified constant" convention as
  the Retirement & Investment section's Roth IRA `ANNUAL_LIMIT`) — only the excess over the
  standard deduction gets a tax benefit, at the combined federal + state marginal rate. Other
  itemizable items (state income tax paid, charitable giving, etc.) aren't modeled.
- **Simplifications flagged for the record**: no SALT deduction cap, no AMT, security deposit
  assumed fully refunded at the end of the horizon, renters insurance held flat (the spec gives
  an increase rate for buy-side insurance but not rent-side).
