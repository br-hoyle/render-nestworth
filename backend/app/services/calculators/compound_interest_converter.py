"""Compound Interest Calculator — NOT a growth projector (that's the Investment Calculator).
This converts a nominal interest rate quoted at one compounding frequency into the equivalent
nominal rate at any other frequency, via the effective-annual-rate bridge:
    effective_annual = (1 + nominal/n)^n - 1        (or e^nominal - 1 for continuous)
    output_nominal    = n_out * ((1+effective_annual)^(1/n_out) - 1)   (or ln(1+effective_annual) for continuous)
Useful for comparing, e.g., a "5% compounded monthly" offer against a "5% compounded annually"
one — they are not the same rate. Decimal's built-in .exp()/.ln() (not just +-*/) make
continuous compounding exact, not an approximation."""

from decimal import Decimal

from app.services.calculators._frequency import PERIODS_PER_YEAR

_ALL_FREQUENCIES = [*PERIODS_PER_YEAR.keys(), "continuous"]


def _effective_annual_rate(nominal_rate: Decimal, frequency: str) -> Decimal:
    if frequency == "continuous":
        return nominal_rate.exp() - 1
    n = PERIODS_PER_YEAR[frequency]
    return (1 + nominal_rate / n) ** n - 1


def _nominal_rate_from_effective(effective_annual_rate: Decimal, frequency: str) -> Decimal:
    if frequency == "continuous":
        return (1 + effective_annual_rate).ln()
    n = PERIODS_PER_YEAR[frequency]
    return n * ((1 + effective_annual_rate) ** (Decimal(1) / n) - 1)


def compute(input_rate: Decimal, input_compound_frequency: str, output_compound_frequency: str) -> dict:
    if input_compound_frequency not in _ALL_FREQUENCIES:
        return {"error": f"Unknown compound frequency: {input_compound_frequency}"}
    if output_compound_frequency not in _ALL_FREQUENCIES:
        return {"error": f"Unknown compound frequency: {output_compound_frequency}"}

    effective_annual = _effective_annual_rate(input_rate, input_compound_frequency)
    output_nominal = _nominal_rate_from_effective(effective_annual, output_compound_frequency)

    comparison_table = [
        {
            "frequency": freq,
            "nominal_rate_pct": round(float(_nominal_rate_from_effective(effective_annual, freq)) * 100, 4),
        }
        for freq in _ALL_FREQUENCIES
    ]

    return {
        "effective_annual_rate_pct": round(float(effective_annual) * 100, 4),
        "output_nominal_rate_pct": round(float(output_nominal) * 100, 4),
        "comparison_table": comparison_table,
    }
