"""Shared numeric helpers for "solve for X given the rest" calculators — extracted from
interest_rate_solver.py's original binary search so every calculator that needs to invert a
monotonic formula (Investment Calculator's contribution/length modes, the retirement savings-
plan/withdrawal calculators) shares one implementation instead of five near-identical loops."""

from decimal import Decimal
from typing import Callable


def bisect_decimal(
    f: Callable[[Decimal], Decimal],
    target: Decimal,
    lo: Decimal,
    hi: Decimal,
    iterations: int = 60,
) -> Decimal:
    """Finds x in [lo, hi] with f(x) ~= target, assuming f is non-decreasing over the range.
    60 iterations halves the interval each time (2^-60 of the initial range) — far beyond the
    precision any of these calculators need."""
    for _ in range(iterations):
        mid = (lo + hi) / 2
        if f(mid) > target:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def bisect_int(
    f: Callable[[int], Decimal],
    target: Decimal,
    lo: int,
    hi: int,
) -> int:
    """Finds the smallest integer n in [lo, hi] with f(n) >= target, assuming f is non-
    decreasing in n. Used where the unknown is a period/month count (must land on a whole
    number), e.g. Investment Calculator's "how long" mode."""
    while lo < hi:
        mid = (lo + hi) // 2
        if f(mid) >= target:
            hi = mid
        else:
            lo = mid + 1
    return lo
