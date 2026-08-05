from datetime import date
from decimal import Decimal, ROUND_HALF_UP


def monthly_payment(principal: Decimal, annual_rate: Decimal, term_years: int) -> Decimal:
    n = term_years * 12
    if annual_rate == 0:
        return (principal / n).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    r = annual_rate / 12
    payment = principal * r * (1 + r) ** n / ((1 + r) ** n - 1)
    return payment.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(d.day, 28))


def _amortize(
    principal: Decimal,
    annual_rate: Decimal,
    term_years: int,
    start_date: date,
    extra_monthly: Decimal = Decimal(0),
    one_time_extra: Decimal = Decimal(0),
    one_time_extra_month: int | None = None,
) -> dict:
    r = annual_rate / 12
    payment = monthly_payment(principal, annual_rate, term_years)
    balance = principal
    total_interest = Decimal(0)
    yearly_schedule = []
    year_principal = Decimal(0)
    year_interest = Decimal(0)
    month = 0

    while balance > 0 and month < term_years * 12 * 2:  # hard safety cap
        month += 1
        interest = (balance * r).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        principal_payment = payment - interest
        extra = extra_monthly
        if one_time_extra_month == month:
            extra += one_time_extra
        principal_payment += extra

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
                    "payment": round(year_principal + year_interest, 2),
                    "principal": round(year_principal, 2),
                    "interest": round(year_interest, 2),
                    "balance": round(balance, 2),
                }
            )
            year_principal = Decimal(0)
            year_interest = Decimal(0)

        if balance <= 0:
            break

    payoff_date = _add_months(start_date, month)
    return {
        "monthly_payment": payment,
        "payoff_date": payoff_date,
        "total_interest": round(total_interest, 2),
        "months_to_payoff": month,
        "yearly_schedule": yearly_schedule,
    }


def compute(
    principal: Decimal,
    annual_rate: Decimal,
    term_years: int,
    start_date: date,
    extra_monthly: Decimal = Decimal(0),
    one_time_extra: Decimal = Decimal(0),
    one_time_extra_month: int | None = None,
) -> dict:
    with_extra = _amortize(
        principal, annual_rate, term_years, start_date, extra_monthly, one_time_extra, one_time_extra_month
    )
    baseline = _amortize(principal, annual_rate, term_years, start_date)

    return {
        "monthly_payment": with_extra["monthly_payment"],
        "payoff_date": with_extra["payoff_date"],
        "total_interest": with_extra["total_interest"],
        "interest_saved": round(baseline["total_interest"] - with_extra["total_interest"], 2),
        "months_saved": baseline["months_to_payoff"] - with_extra["months_to_payoff"],
        "yearly_schedule": with_extra["yearly_schedule"],
    }
