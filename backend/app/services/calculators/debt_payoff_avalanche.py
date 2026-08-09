"""Debt Payoff Calculator — pays down multiple debts using the debt avalanche method (highest
interest rate first), the most cost-efficient payoff order from a pure-interest standpoint.

The "fixed total payment" toggle controls what happens once a debt is paid off: if on, the
money that had been going to it is redirected to the next-priority debt, keeping the
household's total monthly outlay constant until everything's paid off; if off, the total
monthly outlay simply shrinks as each debt disappears (each remaining debt still only gets its
own minimum). An optional extra payment — monthly, or a once-a-year lump sum like a tax
refund — always goes to the highest-priority active debt, on top of either behavior.

Replaces the old debt_payoff.py (single-debt only) and debt_acceleration.py (avalanche-vs-
snowball comparison) — this spec asks for avalanche specifically (the cost-efficient one), not
a strategy comparison, and for the real multi-debt table with the fixed-total-payment option
neither of those modeled."""

from decimal import ROUND_HALF_UP, Decimal

MAX_MONTHS = 1200


def compute(
    debts: list[dict],
    fixed_total_payment: bool = True,
    extra_payment: Decimal = Decimal(0),
    extra_payment_frequency: str = "monthly",
) -> dict:
    if not debts:
        return {"error": "Add at least one debt."}

    order = sorted(range(len(debts)), key=lambda i: -float(debts[i]["annual_rate"]))
    balances = [Decimal(str(d["balance"])) for d in debts]
    monthly_rates = [Decimal(str(d["annual_rate"])) / 12 for d in debts]
    minimums = [Decimal(str(d["minimum_payment"])) for d in debts]
    names = [d.get("name") or f"Debt {i + 1}" for i, d in enumerate(debts)]

    freed_up = Decimal(0)  # minimum payments released by paid-off debts, when fixed_total_payment
    payoff_month: list[int | None] = [None] * len(debts)
    total_interest = Decimal(0)
    month = 0
    schedule = []

    while any(b > 0 for b in balances) and month < MAX_MONTHS:
        month += 1
        extra = Decimal(0)
        if extra_payment_frequency == "monthly":
            extra += extra_payment
        elif extra_payment_frequency == "annually" and month % 12 == 1:
            extra += extra_payment
        if fixed_total_payment:
            extra += freed_up

        for idx in order:
            if balances[idx] <= 0:
                continue
            interest = (balances[idx] * monthly_rates[idx]).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            total_interest += interest
            payment = minimums[idx]
            if extra > 0:
                payment += extra
                extra = Decimal(0)
            principal_payment = payment - interest
            if principal_payment >= balances[idx]:
                overflow = principal_payment - balances[idx]
                balances[idx] = Decimal(0)
                payoff_month[idx] = month
                extra += overflow
                if fixed_total_payment:
                    freed_up += minimums[idx]
            else:
                balances[idx] -= principal_payment

        if month % 12 == 0 or all(b <= 0 for b in balances):
            schedule.append({"year": (month - 1) // 12 + 1, "total_balance": round(sum(balances), 2)})

    lasts_forever = month >= MAX_MONTHS
    return {
        "months_to_payoff": None if lasts_forever else month,
        "years_to_payoff": None if lasts_forever else round(Decimal(month) / 12, 2),
        "total_interest": round(total_interest, 2),
        "payoff_order": [names[i] for i in order],
        "payoff_month_by_debt": {names[i]: payoff_month[i] for i in range(len(debts))},
        "schedule": schedule,
    }
