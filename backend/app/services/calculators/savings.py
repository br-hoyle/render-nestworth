"""Savings Calculator — a real savings-account simulator, distinct from the Investment
Calculator's generic growth engine: separate annual and monthly contributions (each with its
own escalation rate, since a raise might bump one but not the other), a configurable compound
frequency, and tax applied to interest as it's earned (a taxable savings/CD account, not a
tax-advantaged one). Simulated monthly (the finest granularity any input needs) with interest
credited — and taxed — only at the chosen compounding frequency's boundaries."""

from decimal import Decimal

from app.services.calculators._frequency import PERIODS_PER_YEAR


def compute(
    starting_balance: Decimal,
    interest_rate: Decimal,
    term_years: int,
    annual_contribution: Decimal = Decimal(0),
    annual_contribution_increase_pct: Decimal = Decimal(0),
    monthly_contribution: Decimal = Decimal(0),
    monthly_contribution_increase_pct: Decimal = Decimal(0),
    compound_frequency: str = "monthly",
    tax_rate: Decimal = Decimal(0),
) -> dict:
    if compound_frequency not in PERIODS_PER_YEAR:
        return {"error": f"Unknown compound frequency: {compound_frequency}"}
    periods_per_year = PERIODS_PER_YEAR[compound_frequency]
    months_per_credit = max(1, 12 // periods_per_year) if periods_per_year <= 12 else 1
    period_rate = interest_rate / periods_per_year

    balance = starting_balance
    total_contributions = Decimal(0)  # new money added during the simulation — excludes starting_balance
    total_interest_pre_tax = Decimal(0)
    total_tax_paid = Decimal(0)
    uncredited_interest = Decimal(0)
    current_annual_contribution = annual_contribution
    current_monthly_contribution = monthly_contribution
    schedule = []

    for month in range(1, term_years * 12 + 1):
        if month > 1 and (month - 1) % 12 == 0:
            current_annual_contribution *= 1 + annual_contribution_increase_pct
            current_monthly_contribution *= 1 + monthly_contribution_increase_pct

        balance += current_monthly_contribution
        total_contributions += current_monthly_contribution
        if month % 12 == 1:
            balance += current_annual_contribution
            total_contributions += current_annual_contribution

        # Interest accrues on the running balance every month, but is only CREDITED (and
        # taxed) at the chosen compounding frequency's boundary — e.g. quarterly compounding
        # accrues for 3 months before it's added to the balance and taxed as a lump.
        uncredited_interest += balance * (period_rate / months_per_credit)
        if month % months_per_credit == 0:
            after_tax_interest = uncredited_interest * (1 - tax_rate)
            balance += after_tax_interest
            total_interest_pre_tax += uncredited_interest
            total_tax_paid += uncredited_interest - after_tax_interest
            uncredited_interest = Decimal(0)

        if month % 12 == 0:
            schedule.append(
                {
                    "year": month // 12,
                    "balance": round(balance, 2),
                    "starting_balance": round(starting_balance, 2),
                    "contributions_to_date": round(total_contributions, 2),
                }
            )

    return {
        "final_balance": round(balance, 2),
        "total_contributions": round(total_contributions, 2),
        "total_interest_pre_tax": round(total_interest_pre_tax, 2),
        "total_tax_paid": round(total_tax_paid, 2),
        "total_interest_after_tax": round(total_interest_pre_tax - total_tax_paid, 2),
        "schedule": schedule,
    }
