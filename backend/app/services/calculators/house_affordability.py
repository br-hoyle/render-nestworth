from decimal import Decimal, ROUND_HALF_UP


def compute(
    gross_monthly_income: Decimal,
    monthly_debts: Decimal,
    down_payment_pct: Decimal,
    annual_rate: Decimal,
    term_years: int,
    tax_ins_hoa_monthly: Decimal,
    front_end_ratio: Decimal = Decimal("0.28"),
    back_end_ratio: Decimal = Decimal("0.36"),
) -> dict:
    max_piti_front = gross_monthly_income * front_end_ratio
    max_piti_back = gross_monthly_income * back_end_ratio - monthly_debts
    max_piti = min(max_piti_front, max_piti_back)
    max_pi = max_piti - tax_ins_hoa_monthly

    if max_pi <= 0:
        return {
            "max_price": Decimal(0),
            "monthly_piti": Decimal(0),
            "front_end_dti": None,
            "back_end_dti": None,
        }

    r = annual_rate / 12
    n = term_years * 12
    if annual_rate == 0:
        loan_amount = max_pi * n
    else:
        loan_amount = max_pi * ((1 + r) ** n - 1) / (r * (1 + r) ** n)

    max_price = loan_amount / (1 - down_payment_pct)
    front_end_dti = (max_piti / gross_monthly_income * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    back_end_dti = ((max_piti + monthly_debts) / gross_monthly_income * 100).quantize(
        Decimal("0.1"), rounding=ROUND_HALF_UP
    )

    return {
        "max_price": round(max_price, 2),
        "monthly_piti": round(max_piti, 2),
        "front_end_dti": front_end_dti,
        "back_end_dti": back_end_dti,
    }
