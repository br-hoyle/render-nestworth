"""Generic amortizing loan engine — generalizes mortgage.py's payment formula without the
mortgage-specific extra-payment/payoff-comparison framing. Backs Loan, Repayment, Student
Loan, and Amortization calculators (registry-only relabels in routers/calculators.py)."""

from decimal import ROUND_HALF_UP, Decimal

from app.services.calculators.mortgage import monthly_payment


def compute(principal: Decimal, annual_rate: Decimal, term_years: int) -> dict:
    payment = monthly_payment(principal, annual_rate, term_years)
    r = annual_rate / 12
    balance = principal
    total_interest = Decimal(0)
    yearly_schedule = []
    year_principal = Decimal(0)
    year_interest = Decimal(0)
    month = 0

    # A level payment rounded to the cent rarely zeroes the balance at exactly the nominal
    # term — run a little past it (same safety-cap pattern as mortgage.py) so the schedule
    # actually reaches $0 rather than stopping with a stray dollar or two outstanding.
    while balance > 0 and month < term_years * 12 * 2:
        month += 1
        interest = (balance * r).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        principal_payment = payment - interest
        if principal_payment >= balance:
            principal_payment = balance
        balance -= principal_payment
        total_interest += interest
        year_principal += principal_payment
        year_interest += interest

        if month % 12 == 0 or balance <= 0:
            yearly_schedule.append(
                {
                    "year": (month - 1) // 12 + 1,
                    "principal": round(year_principal, 2),
                    "interest": round(year_interest, 2),
                    "balance": round(balance, 2),
                }
            )
            year_principal = Decimal(0)
            year_interest = Decimal(0)

    return {
        "monthly_payment": payment,
        "total_interest": round(total_interest, 2),
        "total_paid": round(principal + total_interest, 2),
        "yearly_schedule": yearly_schedule,
    }
