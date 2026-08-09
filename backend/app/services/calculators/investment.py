"""Investment Calculator — one engine, three "solve for X" modes (matching calculator.net's
tab layout): given the rest of the inputs, find the **end amount**, the **contribution**
needed to hit a goal, or the **investment length** needed to hit a goal. Replaces the old
investment/compound-interest/savings registry entries that all pointed at the same plain
compound-growth math with no way to solve backward for an unknown.

Supports a configurable compounding frequency (weekly/biweekly/monthly/annually) and whether
contributions land at the start or end of each period — everything is expressed in whole
periods at that frequency (n = term_years * periods_per_year), so all three modes reduce to
one future-value-of-annuity formula, solved directly (end amount / contribution) or via integer
bisection (length, since a fractional period doesn't make sense here)."""

from decimal import Decimal

from app.services.calculators._frequency import PERIODS_PER_YEAR
from app.services.calculators._solve import bisect_int


def _future_value(pv: Decimal, pmt: Decimal, rate: Decimal, n: int, contribute_at_beginning: bool) -> Decimal:
    if rate == 0:
        return pv + pmt * n
    growth = (1 + rate) ** n
    timing_factor = (1 + rate) if contribute_at_beginning else Decimal(1)
    return pv * growth + pmt * (growth - 1) / rate * timing_factor


def _schedule(pv: Decimal, pmt: Decimal, rate: Decimal, n: int, periods_per_year: int, contribute_at_beginning: bool) -> list[dict]:
    balance = pv
    points = []
    for period in range(1, n + 1):
        if contribute_at_beginning:
            balance += pmt
            balance *= 1 + rate
        else:
            balance *= 1 + rate
            balance += pmt
        if period % periods_per_year == 0 or period == n:
            contributions_to_date = pmt * period
            points.append(
                {
                    "year": round(Decimal(period) / periods_per_year, 2),
                    "balance": round(balance, 2),
                    "starting_balance": round(pv, 2),
                    "contributions_to_date": round(contributions_to_date, 2),
                }
            )
    return points


def compute(
    current_savings: Decimal,
    annual_rate: Decimal,
    compound_frequency: str,
    contribution_timing: str,
    solve_for: str,
    term_years: int | None = None,
    contribution_amount: Decimal | None = None,
    target_end_amount: Decimal | None = None,
) -> dict:
    if compound_frequency not in PERIODS_PER_YEAR:
        return {"error": f"Unknown compound frequency: {compound_frequency}"}
    periods_per_year = PERIODS_PER_YEAR[compound_frequency]
    rate = annual_rate / periods_per_year
    contribute_at_beginning = contribution_timing == "beginning"

    if solve_for == "end_amount":
        if term_years is None or contribution_amount is None:
            return {"error": "Term and contribution amount are required to project an end amount."}
        n = term_years * periods_per_year
        end_amount = _future_value(current_savings, contribution_amount, rate, n, contribute_at_beginning)
        total_contributions = current_savings + contribution_amount * n
        return {
            "end_amount": round(end_amount, 2),
            "total_contributions": round(total_contributions, 2),
            "total_growth": round(end_amount - total_contributions, 2),
            "schedule": _schedule(current_savings, contribution_amount, rate, n, periods_per_year, contribute_at_beginning),
        }

    if solve_for == "contribution":
        if term_years is None or target_end_amount is None:
            return {"error": "Term and target end amount are required to solve for a contribution."}
        n = term_years * periods_per_year
        growth = (1 + rate) ** n
        lump_sum_fv = current_savings * growth if rate != 0 else current_savings
        remaining = target_end_amount - lump_sum_fv
        if remaining <= 0:
            required_contribution = Decimal(0)
        elif rate == 0:
            required_contribution = remaining / n
        else:
            timing_factor = (1 + rate) if contribute_at_beginning else Decimal(1)
            annuity_factor = (growth - 1) / rate * timing_factor
            required_contribution = remaining / annuity_factor
        return {
            "required_contribution": round(required_contribution, 2),
            "already_met": remaining <= 0,
            "schedule": _schedule(current_savings, required_contribution, rate, n, periods_per_year, contribute_at_beginning),
        }

    if solve_for == "length":
        if contribution_amount is None or target_end_amount is None:
            return {"error": "Contribution amount and target end amount are required to solve for length."}
        if current_savings >= target_end_amount:
            return {"periods_needed": 0, "years_needed": Decimal(0), "schedule": []}
        if contribution_amount <= 0 and rate <= 0:
            return {"error": "With no contributions and no growth, this goal is never reached."}

        max_periods = periods_per_year * 100  # 100-year cap, matches other calculators' safety caps

        def fv_at(n: int) -> Decimal:
            return _future_value(current_savings, contribution_amount, rate, n, contribute_at_beginning)

        n = bisect_int(fv_at, target_end_amount, 0, max_periods)
        if n >= max_periods:
            return {"error": "This goal isn't reachable within 100 years at these inputs."}
        return {
            "periods_needed": n,
            "years_needed": round(Decimal(n) / periods_per_year, 2),
            "schedule": _schedule(current_savings, contribution_amount, rate, n, periods_per_year, contribute_at_beginning),
        }

    return {"error": f"Unknown solve_for mode: {solve_for}"}
