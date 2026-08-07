"""Resolves an "amount or percent" cost input (down payment, property tax, home insurance,
PMI, HOA, other costs — several Mortgage/House-Affordability fields can be quoted either way)
into a concrete annual dollar figure. `value` is a fraction (e.g. 0.012 for 1.2%) when
`is_percent` is True, matching the NumField percent convention used throughout the frontend."""

from decimal import Decimal


def resolve_annual(value: Decimal, is_percent: bool, base: Decimal) -> Decimal:
    return base * value if is_percent else value
