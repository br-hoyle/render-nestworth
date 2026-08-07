"""House Affordability Calculator — two modes for estimating an affordable home price:

- income-to-debt: sizes the price from gross income and a chosen debt-to-income ratio preset
  (Conventional 28/36, FHA 31/43, VA, or a custom back-end-only ratio).
- fixed-budget: solves for the price a chosen total monthly housing budget affords instead,
  with no income/DTI involved.

Both close-form solve for price given that property tax/HOA/insurance may each be quoted as a
flat annual dollar amount or as a percentage of home price per year (_costs.resolve_annual),
and down payment may likewise be a percentage of price or a flat dollar amount — the price
being solved for cancels out algebraically in both cases (see the two _compute_* functions),
so no iteration/bisection is needed here."""

from decimal import ROUND_HALF_UP, Decimal

from app.services.calculators._costs import resolve_annual

DTI_PRESETS = {
    # (front_end_ratio, back_end_ratio) — front_end of 1 means "unconstrained", used where a
    # preset has no standalone front-end cap.
    "conventional": (Decimal("0.28"), Decimal("0.36")),
    "fha": (Decimal("0.31"), Decimal("0.43")),
    # VA loans have no standalone front-end ratio in practice (underwriting instead looks at
    # residual income) — approximated here as "unconstrained front end, 41% back end", the
    # commonly cited VA back-end guideline.
    "va": (Decimal("1"), Decimal("0.41")),
}


def _payment_factor(annual_rate: Decimal, term_years: int) -> Decimal:
    """Monthly payment per $1 of loan amount — the same shape as mortgage.monthly_payment,
    generalized since here the loan amount is the value being solved for, not a known input."""
    n = term_years * 12
    if annual_rate == 0:
        return Decimal(1) / n
    r = annual_rate / 12
    growth = (1 + r) ** n
    return r * growth / (growth - 1)


def _escrow_rate_and_fixed(
    property_tax_value: Decimal,
    property_tax_is_percent: bool,
    hoa_value: Decimal,
    hoa_is_percent: bool,
    insurance_value: Decimal,
    insurance_is_percent: bool,
) -> tuple[Decimal, Decimal]:
    """Splits the three escrow items into a combined monthly rate-of-price (for percent-based
    items) and a combined flat monthly dollar amount (for dollar-based items)."""
    pct_rate = Decimal(0)
    fixed_monthly = Decimal(0)
    for value, is_percent in (
        (property_tax_value, property_tax_is_percent),
        (hoa_value, hoa_is_percent),
        (insurance_value, insurance_is_percent),
    ):
        if is_percent:
            pct_rate += value / 12
        else:
            fixed_monthly += value / 12
    return pct_rate, fixed_monthly


def _solve_price(
    available_monthly: Decimal,
    factor: Decimal,
    pct_rate: Decimal,
    fixed_monthly: Decimal,
    down_payment_value: Decimal,
    down_payment_is_percent: bool,
) -> Decimal:
    if down_payment_is_percent:
        denom = (1 - down_payment_value) * factor + pct_rate
        price = (available_monthly - fixed_monthly) / denom if denom > 0 else Decimal(0)
    else:
        denom = factor + pct_rate
        price = (available_monthly - fixed_monthly + down_payment_value * factor) / denom if denom > 0 else Decimal(0)
    return max(price, Decimal(0))


def _compute_income_to_debt(
    annual_income: Decimal,
    term_years: int,
    annual_rate: Decimal,
    monthly_debts: Decimal,
    down_payment_value: Decimal,
    down_payment_is_percent: bool,
    property_tax_value: Decimal,
    property_tax_is_percent: bool,
    hoa_value: Decimal,
    hoa_is_percent: bool,
    insurance_value: Decimal,
    insurance_is_percent: bool,
    dti_preset: str,
    custom_back_end_ratio: Decimal,
) -> dict:
    if dti_preset == "custom":
        front_end_ratio, back_end_ratio = Decimal(1), custom_back_end_ratio
    else:
        front_end_ratio, back_end_ratio = DTI_PRESETS.get(dti_preset, DTI_PRESETS["conventional"])

    gross_monthly_income = annual_income / 12
    max_piti_front = gross_monthly_income * front_end_ratio
    max_piti_back = gross_monthly_income * back_end_ratio - monthly_debts
    max_piti = min(max_piti_front, max_piti_back)

    factor = _payment_factor(annual_rate, term_years)
    pct_rate, fixed_monthly = _escrow_rate_and_fixed(
        property_tax_value, property_tax_is_percent, hoa_value, hoa_is_percent, insurance_value, insurance_is_percent
    )
    max_price = _solve_price(max_piti, factor, pct_rate, fixed_monthly, down_payment_value, down_payment_is_percent)

    if max_price <= 0 or gross_monthly_income <= 0:
        return {
            "max_price": Decimal(0),
            "loan_amount": Decimal(0),
            "down_payment_amount": Decimal(0),
            "monthly_pi": Decimal(0),
            "monthly_escrow": Decimal(0),
            "monthly_piti": Decimal(0),
            "front_end_dti": None,
            "back_end_dti": None,
        }

    down_payment_amount = resolve_annual(down_payment_value, down_payment_is_percent, max_price)
    loan_amount = max_price - down_payment_amount
    monthly_pi = (loan_amount * factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    monthly_escrow = round(max_price * pct_rate + fixed_monthly, 2)
    monthly_piti = round(monthly_pi + monthly_escrow, 2)
    front_end_dti = (monthly_piti / gross_monthly_income * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    back_end_dti = ((monthly_piti + monthly_debts) / gross_monthly_income * 100).quantize(
        Decimal("0.1"), rounding=ROUND_HALF_UP
    )

    return {
        "max_price": round(max_price, 2),
        "loan_amount": round(loan_amount, 2),
        "down_payment_amount": round(down_payment_amount, 2),
        "monthly_pi": monthly_pi,
        "monthly_escrow": monthly_escrow,
        "monthly_piti": monthly_piti,
        "front_end_dti": front_end_dti,
        "back_end_dti": back_end_dti,
    }


def _compute_fixed_budget(
    monthly_budget: Decimal,
    term_years: int,
    annual_rate: Decimal,
    down_payment_value: Decimal,
    down_payment_is_percent: bool,
    property_tax_value: Decimal,
    property_tax_is_percent: bool,
    hoa_value: Decimal,
    hoa_is_percent: bool,
    insurance_value: Decimal,
    insurance_is_percent: bool,
    maintenance_monthly: Decimal,
) -> dict:
    factor = _payment_factor(annual_rate, term_years)
    pct_rate, fixed_escrow_monthly = _escrow_rate_and_fixed(
        property_tax_value, property_tax_is_percent, hoa_value, hoa_is_percent, insurance_value, insurance_is_percent
    )
    max_price = _solve_price(
        monthly_budget - maintenance_monthly, factor, pct_rate, fixed_escrow_monthly, down_payment_value, down_payment_is_percent
    )

    down_payment_amount = resolve_annual(down_payment_value, down_payment_is_percent, max_price)
    loan_amount = max_price - down_payment_amount
    monthly_pi = (loan_amount * factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    monthly_escrow = round(max_price * pct_rate + fixed_escrow_monthly, 2)

    return {
        "max_price": round(max_price, 2),
        "loan_amount": round(loan_amount, 2),
        "down_payment_amount": round(down_payment_amount, 2),
        "monthly_pi": monthly_pi,
        "monthly_escrow": monthly_escrow,
        "monthly_maintenance": round(maintenance_monthly, 2),
        "monthly_piti": round(monthly_pi + monthly_escrow + maintenance_monthly, 2),
    }


def compute(
    mode: str = "income-to-debt",
    annual_income: Decimal = Decimal(0),
    monthly_budget: Decimal = Decimal(0),
    monthly_debts: Decimal = Decimal(0),
    term_years: int = 30,
    annual_rate: Decimal = Decimal("0.065"),
    down_payment_value: Decimal = Decimal("0.20"),
    down_payment_is_percent: bool = True,
    property_tax_value: Decimal = Decimal(0),
    property_tax_is_percent: bool = True,
    hoa_value: Decimal = Decimal(0),
    hoa_is_percent: bool = False,
    insurance_value: Decimal = Decimal(0),
    insurance_is_percent: bool = True,
    dti_preset: str = "conventional",
    custom_back_end_ratio: Decimal = Decimal("0.36"),
    maintenance_monthly: Decimal = Decimal(0),
) -> dict:
    if mode == "fixed-budget":
        return _compute_fixed_budget(
            monthly_budget,
            term_years,
            annual_rate,
            down_payment_value,
            down_payment_is_percent,
            property_tax_value,
            property_tax_is_percent,
            hoa_value,
            hoa_is_percent,
            insurance_value,
            insurance_is_percent,
            maintenance_monthly,
        )
    return _compute_income_to_debt(
        annual_income,
        term_years,
        annual_rate,
        monthly_debts,
        down_payment_value,
        down_payment_is_percent,
        property_tax_value,
        property_tax_is_percent,
        hoa_value,
        hoa_is_percent,
        insurance_value,
        insurance_is_percent,
        dti_preset,
        custom_back_end_ratio,
    )
