"""General periodic amortization engine — a fixed payment against a balance, at any payment
frequency, with four independent optional extra-payment types layered on top: a recurring
extra every single period (`extra_recurring` — e.g. an additional biweekly payment on top of a
biweekly payoff schedule), a recurring extra roughly once a calendar month
(`extra_monthly` — fires every `max(1, round(payments_per_year / 12))` periods, which
collapses to "every period" at monthly cadence, matching this parameter's original monthly-only
behavior), a recurring extra once a calendar year (`extra_yearly` — every `payments_per_year`
periods), and a single one-time extra (`extra_one_time`). Backs the Mortgage, Amortization, and
Mortgage Payoff calculators, which each need a different subset of this generality (Mortgage:
no extras; Amortization: monthly cadence, `extra_monthly`/`extra_yearly`/`extra_one_time`;
Mortgage Payoff: either those three on a monthly-cadence payoff, or all four — including
`extra_recurring` — on a biweekly-cadence one).

Kept separate from mortgage.py's original monthly_payment/_amortize (still used by Refinance
and the House Affordability sizing math, neither of which needs extra payments or a
non-monthly cadence) rather than generalizing those in place."""

from decimal import ROUND_HALF_UP, Decimal

MAX_PERIODS = 1200  # 100 years at monthly cadence — same safety-cap convention as mortgage.py


def amortize(
    balance: Decimal,
    annual_rate: Decimal,
    payment: Decimal,
    payments_per_year: int = 12,
    extra_recurring: Decimal = Decimal(0),
    extra_recurring_start_period: int = 1,
    extra_monthly: Decimal = Decimal(0),
    extra_monthly_start_period: int = 1,
    extra_yearly: Decimal = Decimal(0),
    extra_yearly_start_period: int = 1,
    extra_one_time: Decimal = Decimal(0),
    extra_one_time_period: int | None = None,
) -> dict:
    """Simulates period-by-period until the balance reaches zero (or MAX_PERIODS is hit, in
    which case the payment doesn't cover interest and payoff never completes)."""
    r = annual_rate / payments_per_year
    monthly_cadence_periods = max(1, round(payments_per_year / 12))
    period_balance = balance
    total_interest = Decimal(0)
    periods = []
    period = 0

    while period_balance > 0 and period < MAX_PERIODS:
        period += 1
        interest = (period_balance * r).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        principal_payment = payment - interest

        extra = Decimal(0)
        if extra_recurring > 0 and period >= extra_recurring_start_period:
            extra += extra_recurring
        if (
            extra_monthly > 0
            and period >= extra_monthly_start_period
            and (period - extra_monthly_start_period) % monthly_cadence_periods == 0
        ):
            extra += extra_monthly
        if (
            extra_yearly > 0
            and period >= extra_yearly_start_period
            and (period - extra_yearly_start_period) % payments_per_year == 0
        ):
            extra += extra_yearly
        if extra_one_time > 0 and period == extra_one_time_period:
            extra += extra_one_time
        principal_payment += extra

        if principal_payment >= period_balance:
            principal_payment = period_balance
        period_balance -= principal_payment
        total_interest += interest
        periods.append({"period": period, "interest": interest, "principal": principal_payment, "balance": period_balance})

    lasts_forever = period >= MAX_PERIODS and period_balance > 0
    yearly_schedule = []
    year_principal = Decimal(0)
    year_interest = Decimal(0)
    for p in periods:
        year_principal += p["principal"]
        year_interest += p["interest"]
        if p["period"] % payments_per_year == 0 or p["period"] == len(periods):
            yearly_schedule.append(
                {
                    "year": (p["period"] - 1) // payments_per_year + 1,
                    "principal": round(year_principal, 2),
                    "interest": round(year_interest, 2),
                    "balance": round(p["balance"], 2),
                }
            )
            year_principal = Decimal(0)
            year_interest = Decimal(0)

    return {
        "periods_to_payoff": None if lasts_forever else period,
        "total_interest": round(total_interest, 2),
        "yearly_schedule": yearly_schedule,
        "periods": periods,
    }
