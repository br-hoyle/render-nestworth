"""Optional/flagged calculator per CLAUDE.md ("rebalancing (optional/flagged feature)")."""

from decimal import Decimal


def compute(current_allocation: dict[str, Decimal], target_allocation_pct: dict[str, Decimal]) -> dict:
    total = sum(current_allocation.values(), Decimal(0))
    if total <= 0:
        return {"total": Decimal(0), "trades": {}}

    trades = {}
    for category, target_pct in target_allocation_pct.items():
        target_dollars = total * target_pct / 100
        current_dollars = current_allocation.get(category, Decimal(0))
        trades[category] = round(target_dollars - current_dollars, 2)

    return {"total": round(total, 2), "trades": trades}
