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

Five calculators, covering both sides of borrowing math — sizing/pricing a loan or an
uncompounded return (Loan, Repayment, Simple Interest) and paying down what's already owed
(Debt Payoff, Debt Consolidation). The nav dropdown splits these into two columns: **Debt
Calculators** (Loan, Debt Payoff, Debt Consolidation) and **Investment Calculators**
(Repayment, Simple Interest). A shared `_annuity.py` module backs Loan and Repayment:
`effective_period_rate` bridges a nominal annual rate stated at one compounding frequency to
the effective rate for a (possibly different) payback frequency, `annuity_payment` is a
frequency-agnostic generalization of `mortgage.monthly_payment`'s level-payment formula, and
`periods_for_payment` closed-form inverts it (via `Decimal.ln()`) to solve for how many periods
a fixed payment takes — no bisection needed here, unlike the Retirement & Investment section's
`_solve.py` helper. The Payment Calculator, Emergency Fund Calculator, and Target Emergency
Fund Calculator that previously sat in this section were removed: Payment duplicated Loan's
Amortized tab and Repayment's Fixed Time/Fixed Installment modes with a narrower monthly-only
input set, and both Emergency Fund calculators duplicated the Scorecard's Emergency Fund KPI
(months-of-expenses-covered, red/yellow/green thresholds) without adding a distinct framing.

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

### Repayment Calculator

`repayment_calculator.py` — solves for one of two unknowns on an existing balance (rather than
a fresh loan), with independently configurable compound and payback frequencies (via
`effective_period_rate`, exactly as in Loan's Amortized tab).

- **Fixed Time** — given a balance, rate, and a term in years, finds the per-period payment via
  `annuity_payment`. (The backend also accepts an optional extra-months component for finer
  terms; the calculator's own UI only exposes whole years, matching Loan Calculator's layout.)
- **Fixed Installment** — given a balance, rate, and a fixed payment per period, finds how many
  periods it takes via `periods_for_payment`. Returns an explicit error rather than a runaway
  result if the payment doesn't even cover the first period's interest.

### Simple Interest Calculator

`simple_interest.py` — interest that accrues on the principal only, with no compounding:
`interest = principal × annual_rate × years`, `total = principal + interest`. The one
calculator in this section with no iterative or closed-form solve — useful for short-term loans
and some bonds/CDs where interest doesn't compound.

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

Six calculators, laid out in the nav dropdown as a fixed 3-column, 2-row grid (Mortgage /
Mortgage Payoff, House Affordability / Rent vs. Buy, Refinance / Amortization) rather than
alphabetical order. `_amortization.py`'s `amortize()` is the shared engine behind four of them
(Mortgage, Amortization, Mortgage Payoff, Rent vs. Buy): a periodic amortization loop at any
payments-per-year frequency, with four independent, combinable optional extra-payment types — a
recurring extra every single period (`extra_recurring`), a recurring extra roughly once a
calendar month regardless of the underlying payment cadence (`extra_monthly` — fires every
`max(1, round(payments_per_year / 12))` periods, which collapses to "every period" at monthly
cadence, its original behavior), a recurring extra once a calendar year (`extra_yearly` — every
`payments_per_year` periods), and a single one-time extra (`extra_one_time`). `_dates.py`
converts a household-picked calendar date for each extra's "start at" into the period offset
this engine actually consumes — `months_elapsed()` for monthly-cadence calls (exact calendar
months), `periods_elapsed()` more generally (a fixed days-per-period approximation for other
cadences, e.g. biweekly). `_costs.resolve_annual()` resolves an "amount or percent" cost field
(down payment, property tax, home insurance, PMI, HOA, other costs, closing costs, renters
insurance) into a concrete annual dollar figure given a base — used wherever the spec allows a
cost to be quoted either way.

### Mortgage Calculator

`mortgage.py` — the full monthly cost of owning a home, not just principal & interest: property
tax, home insurance, PMI, HOA fees, and other recurring costs, each entered as a flat annual
dollar amount or a percentage of home price per year. PMI is included only when the down payment
is under 20% of the home price (the standard trigger for requiring it) but, once included, is
modeled as a flat recurring cost for the life of the loan rather than auto-cancelling once
paydown reaches 20% equity — real mortgages typically do cancel it at that point, but the
spec's PMI input has no cancellation rule specified, so this keeps the assumption simple and
explicit rather than adding unrequested behavior. `monthly_payment()` is also imported directly
by `refinance.py` and `debt_consolidation.py`.

### Amortization Calculator

`amortization.py` — a full amortization schedule with three optional, independent, and
combinable extra-payment types: a recurring extra every month (from a chosen start date), a
recurring extra once a year (from a chosen start date), and a single one-time extra (on a chosen
date). Compares the result against the same loan with no extras to report interest and time
saved, and reports a projected payoff date alongside the raw months/years figure.

### Mortgage Payoff Calculator

`mortgage_payoff.py` — for a loan already in progress: replays the original loan's amortization
schedule up to today (elapsed time = original term − remaining term) to find the current
balance, then compares two ways to finish paying it off faster than the original schedule —
continue at the original payment plus optional extra payments (reusing the Amortization
Calculator's engine), or switch to biweekly payments (half the monthly payment every two weeks —
26 payments/year, the equivalent of 13 monthly payments/year, modeled by re-running the engine at
`payments_per_year=26` — an approximation, since real biweekly billing cycles don't line up with
exact 1/26-year periods, but the same simplification calculator.net's version uses), optionally
with its own extra-biweekly/monthly/yearly/one-time payments layered on top of the biweekly
cadence. Both modes report interest and time saved against the original, unmodified schedule —
that comparison is always computed internally rather than exposed as its own selectable mode
(the previous "Normal Repayment" and "Pay Off Altogether" tabs were dropped as separate options
since they duplicated, respectively, the always-visible baseline comparison and a one-line payoff
figure that didn't need its own tab).

### House Affordability Calculator

`house_affordability.py` — two modes, both solved in closed form for the base case (no bisection
needed, since the unknown being solved for — home price — cancels out algebraically whether
costs are percent-of-price or flat dollar amounts) plus a second solve pass when PMI applies
(PMI depends on the down-payment-to-price ratio, which is only fully known once a price is
solved — both modes solve once without PMI, check the resulting ratio against the 20% threshold,
and re-solve with PMI folded in if it's under):

- **Income to Debt** — sizes price from gross income and a debt-to-income ratio preset:
  Conventional (28% front-end / 36% back-end), FHA (31%/43%), VA (approximated here as
  "unconstrained front-end, 41% back-end" — VA underwriting has no standalone front-end ratio in
  practice, instead evaluating residual income, so this is a simplification), or a custom
  back-end-only ratio.
- **Fixed Monthly Budget** — solves for the price a chosen total monthly housing budget affords
  instead, with no income or DTI involved.

Both modes share the same five optional cost inputs as the Mortgage Calculator (property tax,
home insurance, PMI, HOA fees, other costs, each percent-or-flat) and return the same
`monthly_escrow` breakdown shape for display parity.

### Refinance Calculator

`refinance.py` — unlike the original version, the current loan's remaining term isn't asked for
directly (households rarely know that number precisely); instead it's derived from the balance,
rate, and current monthly payment already on a statement, via `_annuity.periods_for_payment` (the
same closed-form inversion the Debt & Payment section's Repayment Calculator uses). **Loan
Fees** (a flat dollar amount) sits in the main required "New" row; **Loan Points** (a percentage
of the new loan amount, paid upfront to secure the quoted rate) and **Cash Out Amount** are
optional. Both loan-fee types are folded into a single upfront-cost figure for the breakeven
calculation; cash out is added directly to the new loan's principal and nets against the upfront
cost, since receiving cash offsets what refinancing costs.

### Rent vs. Buy Calculator

`rent_vs_buy.py` — the most involved calculator in the app. For **every staying length N from 1
year up to the chosen comparison horizon** (default 5 years — raise it to see more of the curve,
the same way a longer loan term reveals more of the shape on calculator.net's version), it
reports the **average monthly cost** of each option if you sold the home (or stopped renting)
after N years — matching calculator.net's own "average cost by staying length" framing, which is
what makes a clean "buying is cheaper if you stay N years or longer" statement possible instead
of only a single end-of-horizon number.

- **Buy side, `avg_buy_cost(N)`**: every dollar paid out through year N (down payment, closing
  costs, P&I via `_amortization.amortize()` — stopping once the loan is paid off, if that happens
  before N — property tax, home insurance, PMI under the same 20%-down trigger as `mortgage.py`,
  HOA, other costs, minus the mortgage-interest tax shield) **minus the net sale proceeds if sold
  at year N** (home value appreciated N years, net of selling closing costs, minus the remaining
  loan balance) — divided by `12 × N`. Netting out the sale proceeds is the fix for the case this
  calculator used to get wrong: without it, buying could never look cheaper long-term even though
  paying down a mortgage builds equity a renter never gets back. Property tax escalates at its own
  annual rate, independent of home appreciation (a mill-rate-style increase rather than tied to
  the home's assessed value); home insurance/PMI/HOA/other costs share a "costs increase" rate.
  Both escalation rates are fixed, undocumented-to-the-household assumptions (2%/yr each, the same
  "documented simplified constant" convention as `STANDARD_DEDUCTION` below) rather than exposed
  inputs — Home Value Appreciation is the one growth rate that matters most, and the one the
  household tunes directly. Closing costs (percent-of-price or flat) are a one-time upfront cost;
  selling closing costs are a one-time % of the home's appreciated value, applied at every N (since
  the whole point of this calculator is asking "what if I sold at year N," for every N — not just
  the final year).
- **Rent side, `avg_rent_cost(N)`**: every dollar paid through year N (rent, renters insurance,
  upfront cost) **minus the investment growth** — not the principal, which is already reflected in
  the two sides' raw cash-outlay difference — earned on whichever side had more cash free to
  invest upfront (typically the renter, since buying ties up a down payment renting doesn't
  require) at the household's average investment return. This is the standard "invest the
  difference" opportunity-cost treatment, applied per staying length instead of once at a fixed
  horizon.
- **Break-even**: the two average-cost curves are compared year by year; the first year buying's
  average drops from more expensive to cheaper (linearly interpolated to one decimal place, e.g.
  "4.9 years," matching calculator.net's display) is `breakeven_year`. If a later, unusual
  combination of inputs flips the ranking back, that second crossing isn't separately reported —
  the answer is always framed as a single break-even statement.
- **Chart**: two lines, `avg_buy_cost` ("Buy") and `avg_rent_cost` ("Rent"), plotted for every year
  from 1 to the comparison horizon, with the break-even year marked directly on the chart.
- **Tax treatment**: assumes the household itemizes only when mortgage interest + property tax
  paid that year exceeds the standard deduction for their filing status (`STANDARD_DEDUCTION` —
  approximate, single-tax-year constants, the same "documented simplified constant" convention as
  the Retirement & Investment section's Roth IRA `ANNUAL_LIMIT`) — only the excess over the
  standard deduction gets a tax benefit, at the combined federal + state marginal rate. Other
  itemizable items (state income tax paid, charitable giving, etc.) aren't modeled.
- **Simplifications flagged for the record**: no SALT deduction cap, no AMT, security deposit
  assumed fully refunded whenever renting stops (so it's excluded from the running rent cost
  entirely, rather than modeled as a temporary outflow), renters insurance (percent-of-annual-rent
  or flat) held flat year over year — the household's "costs increase" assumption only drives
  buy-side costs. calculator.net's own formula isn't published, so this methodology is a
  from-first-principles model built to match its known conceptual shape (average cost by staying
  length, netting home equity, investing the upfront difference) rather than a byte-for-byte
  reproduction of its internals.
