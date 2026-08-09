"""401(k) Match Maximizer — employer matches are usually tiered ("100% of the first 3%, 50%
of the next 2%"), and both under-contributing AND over-contributing can leave match money on
the table: too low and you simply don't reach the tiers; too high (as a % of a high salary)
and you can hit the IRS annual employee-deferral limit before the year is out, so the employer
stops matching for the rest of the year even though your % was technically enough. This finds
the contribution-% window that captures the full match without risking that early cutoff.

Match tiers are treated as CUMULATIVE (tier 2's limit is the total % needed to capture both
tiers, e.g. "100%/3%, 50%/5%" means 5% total contribution captures the full match) — the most
common real-world 401(k) match structure. IRS_ANNUAL_LIMIT is a documented, simplified constant
(the real limit changes yearly and this doesn't model catch-up contributions for 50+), same
convention as roth_ira.py's ANNUAL_LIMIT."""

from decimal import Decimal

IRS_ANNUAL_LIMIT = Decimal("23000")


def compute(
    current_age: int,
    annual_income: Decimal,
    employer_match_1_pct: Decimal = Decimal("1.00"),
    employer_match_1_limit_pct: Decimal = Decimal("0.03"),
    employer_match_2_pct: Decimal = Decimal("0.50"),
    employer_match_2_limit_pct: Decimal = Decimal("0.02"),
) -> dict:
    # employer_match_2_limit_pct is the ADDITIONAL % beyond tier 1 (matches the spec's two
    # separate "Employer Match 2 Limit" framing) — total cumulative threshold is the sum.
    tier_1_limit = employer_match_1_limit_pct
    tier_2_limit = employer_match_1_limit_pct + employer_match_2_limit_pct

    if annual_income <= 0:
        return {"error": "Annual income must be greater than zero."}

    recommended_min_pct = tier_2_limit
    irs_limit_pct = min(Decimal(1), IRS_ANNUAL_LIMIT / annual_income)

    estimated_annual_match = (
        tier_1_limit * employer_match_1_pct * annual_income
        + employer_match_2_limit_pct * employer_match_2_pct * annual_income
    )

    meets_full_match_within_irs_limit = recommended_min_pct <= irs_limit_pct

    return {
        "recommended_min_pct": round(float(recommended_min_pct) * 100, 2),
        "recommended_max_pct": round(float(irs_limit_pct) * 100, 2),
        "irs_limit_pct": round(float(irs_limit_pct) * 100, 2),
        "estimated_annual_employer_match": round(estimated_annual_match, 2),
        "meets_full_match_within_irs_limit": meets_full_match_within_irs_limit,
    }
