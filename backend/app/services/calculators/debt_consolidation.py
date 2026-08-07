from decimal import Decimal

from app.services.calculators.mortgage import monthly_payment


def compute(
    debts: list[dict],
    new_rate: Decimal,
    new_term_years: int,
    loan_origination_fee: Decimal = Decimal(0),
) -> dict:
    total_balance = sum((Decimal(str(d["balance"])) for d in debts), Decimal(0))
    if total_balance <= 0:
        return {
            "total_balance": Decimal(0),
            "blended_current_rate_pct": 0.0,
            "current_total_monthly_payment": Decimal(0),
            "new_monthly_payment": Decimal(0),
            "monthly_savings": Decimal(0),
            "new_total_cost_including_fee": round(loan_origination_fee, 2),
        }

    weighted_rate = sum(
        (Decimal(str(d["balance"])) * Decimal(str(d["annual_rate"])) for d in debts), Decimal(0)
    ) / total_balance
    current_total_payment = sum((Decimal(str(d.get("monthly_payment", 0))) for d in debts), Decimal(0))
    new_payment = monthly_payment(total_balance, new_rate, new_term_years)
    # The origination fee is a one-time cost on top of the loan itself — folded into a "total
    # cost" figure rather than the monthly payment, since it's typically paid up front or
    # rolled in rather than amortized.
    new_total_cost_including_fee = new_payment * new_term_years * 12 + loan_origination_fee

    return {
        "total_balance": round(total_balance, 2),
        "blended_current_rate_pct": round(float(weighted_rate) * 100, 3),
        "current_total_monthly_payment": round(current_total_payment, 2),
        "new_monthly_payment": new_payment,
        "monthly_savings": round(current_total_payment - new_payment, 2),
        "new_total_cost_including_fee": round(new_total_cost_including_fee, 2),
    }
