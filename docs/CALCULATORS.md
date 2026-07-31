# Calculator formulas (backlog pass 2 additions)

The original 7 calculators (Compound growth, Mortgage, Debt payoff, Emergency fund, House
affordability, Retirement, Rebalancing) are documented by their own hand-checked pytest
cases in [`backend/tests/test_calculators.py`](../backend/tests/test_calculators.py). This
file covers the 16 additions, grouped by whether they're genuinely new math or a relabeled
reuse of existing math (registered in `CALCULATORS` in
[`backend/app/routers/calculators.py`](../backend/app/routers/calculators.py)).

## Genuinely new math

**Loan** (`services/calculators/loan.py`) — a general-purpose amortizing-loan engine
(standard `payment = P × r(1+r)^n / ((1+r)^n − 1)` formula, shared with `mortgage.py` via
`monthly_payment()`), without mortgage-specific extra-payment/payoff-comparison framing.
Backs Loan, Repayment, Student loan, and Amortization (all registry-only relabels of the
same `loan.compute`, differing only in default inputs/grouping).

**Refinance** — compares a current mortgage's payment (at its current rate/remaining term)
against a new loan's payment (new rate/term) on the same balance; `monthly_savings =
current_payment − new_payment`; `breakeven_months = closing_costs ÷ monthly_savings`
(rounded up), `None` if refinancing doesn't actually lower the payment.

**Interest rate solver** — given a principal, a target monthly payment, and a term, solves
for the implied annual rate via binary search over the standard amortization payment formula
(60 iterations; a closed-form inversion isn't practical). Returns an explicit error if the
target payment is at or below what a 0% loan would require.

**Roth IRA / Traditional IRA** — year-by-year `balance = balance × (1 + rate) +
contribution`, with `contribution` capped at a documented simplified `$7,000/yr` limit (the
real IRS limit changes yearly and is a shared cap across Roth+Traditional contributions, not
modeled as two independent limits here). Roth models tax-free growth/withdrawal framing;
Traditional models pre-tax growth only — neither models the tax deduction or withdrawal tax.

**Simple interest** — `interest = principal × rate × years` (no compounding), for comparison
against the compound-growth-based calculators.

**Debt consolidation** — `blended_rate = Σ(balance × rate) ÷ Σ(balance)` across the input
debts (a weighted average), then computes a single new payment on the combined balance at
the proposed consolidation rate/term via `mortgage.monthly_payment`.

**Financial independence** — `FI number = annual expenses ÷ withdrawal rate` (the standard
"25× annual expenses" rule at a 4% withdrawal rate); then projects
`balance = balance × (1 + expected_return) + annual_savings` year by year until balance ≥ FI
number. Distinct from the existing Retirement calculator, which projects an age-based
drawdown rather than solving for "when do I reach FI."

**Debt payoff acceleration** — simulates multiple debts monthly under two orderings:
avalanche (highest rate first) and snowball (lowest balance first). Each month, minimums are
paid on every debt and all extra payment cascades to the current priority debt; once a debt
is paid off, any leftover from that month's payment rolls forward to the next debt in order,
within the same month. Compared against a baseline (same debts, no extra payment) to report
months/interest saved by each strategy.

**Target emergency fund** — `target_amount = monthly_expense × target_months`;
`shortfall = target_amount − current_liquid_balance`; `required_monthly_contribution =
shortfall ÷ months_to_reach_goal`. Complements the existing Emergency Fund calculator (which
answers "how many months am I covered for today") by solving for the savings pace needed to
hit a goal by a target date.

## Registry-only relabels (same compute function, different defaults/grouping)

- **Investment**, **Compound interest**, **Savings goal** → all register against the
  existing `compound_growth.compute`, differing only in default inputs and which Plan group
  they appear under (Investment vs. a generic savings-goal framing).
- **Amortization** (Housing group), **Repayment**, **Student loan** (Debt group) → all
  register against `loan.compute`, differing only in default term/rate and grouping.

No new math is duplicated for these — see the "reuse over duplication" note in
`routers/calculators.py`'s `CALCULATORS` dict.
