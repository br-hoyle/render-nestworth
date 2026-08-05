"""Debt Payoff Acceleration Tool — simulates multiple debts under avalanche (highest rate
first) vs. snowball (lowest balance first) strategies, with all extra payment cascading to
the current priority debt each month (and rolling over to the next once one is paid off)."""

from decimal import ROUND_HALF_UP, Decimal


def _simulate(debts: list[dict], extra_payment: Decimal, order: list[int]) -> dict:
    balances = [Decimal(str(d["balance"])) for d in debts]
    monthly_rates = [Decimal(str(d["annual_rate"])) / 12 for d in debts]
    minimums = [Decimal(str(d["minimum_payment"])) for d in debts]

    month = 0
    total_interest = Decimal(0)
    while any(b > 0 for b in balances) and month < 1200:
        month += 1
        extra = extra_payment
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
                extra += principal_payment - balances[idx]
                balances[idx] = Decimal(0)
            else:
                balances[idx] -= principal_payment

    return {"months": month, "total_interest": round(total_interest, 2)}


def compute(debts: list[dict], extra_payment: Decimal = Decimal(0)) -> dict:
    avalanche_order = sorted(range(len(debts)), key=lambda i: -float(debts[i]["annual_rate"]))
    snowball_order = sorted(range(len(debts)), key=lambda i: float(debts[i]["balance"]))

    avalanche = _simulate(debts, extra_payment, avalanche_order)
    snowball = _simulate(debts, extra_payment, snowball_order)
    baseline = _simulate(debts, Decimal(0), avalanche_order)

    return {
        "avalanche_months": avalanche["months"],
        "avalanche_total_interest": avalanche["total_interest"],
        "snowball_months": snowball["months"],
        "snowball_total_interest": snowball["total_interest"],
        "baseline_months": baseline["months"],
        "baseline_total_interest": baseline["total_interest"],
        "months_saved_avalanche": baseline["months"] - avalanche["months"],
        "months_saved_snowball": baseline["months"] - snowball["months"],
    }
