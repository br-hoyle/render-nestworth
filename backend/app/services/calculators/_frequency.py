"""Shared compounding-frequency vocabulary — used by the Investment, Savings, and Compound
Interest calculators so "monthly means 12/year" is defined exactly once."""

PERIODS_PER_YEAR = {
    "annually": 1,
    "semiannually": 2,
    "quarterly": 4,
    "monthly": 12,
    "biweekly": 26,
    "weekly": 52,
    "daily": 365,
}
