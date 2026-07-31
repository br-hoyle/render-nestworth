export interface KpiContent {
  description: string;
  formula: string;
  whyItMatters: string;
  howToInterpret: string;
}

export const KPI_CONTENT: Record<string, KpiContent> = {
  emergency_fund: {
    description: "How many months your liquid savings could cover your typical spending.",
    formula: "Liquid account balances ÷ average monthly expense",
    whyItMatters: "A thin buffer means one job loss or surprise bill turns into debt.",
    howToInterpret: "Below 3 months is fragile, 3–6 is building, above 6 is a solid cushion.",
  },
  liquidity_ratio: {
    description: "How many months your cash alone (not investments) could cover spending.",
    formula: "Cash account balances ÷ average monthly expense",
    whyItMatters: "Distinguishes truly-liquid cash from savings that might be invested and harder to access quickly.",
    howToInterpret: "Above 1.0x means you have at least a month of expenses sitting in cash.",
  },
  housing_cost_ratio: {
    description: "The share of gross income going to housing.",
    formula: "Monthly housing expense ÷ monthly gross income × 100",
    whyItMatters: "Lenders and budgeting rules of thumb use this to judge how stretched a household is by housing costs.",
    howToInterpret: "Under 28% is comfortable, 28–36% is tight, above that is a red flag.",
  },
  savings_rate: {
    description: "The share of income you're keeping rather than spending.",
    formula: "(Income − expenses) ÷ income × 100",
    whyItMatters: "This is the single biggest lever most households have over how fast wealth grows.",
    howToInterpret: "Under 5% leaves little room for goals, 15%+ is a strong, sustainable pace.",
  },
  net_worth_growth_yoy: {
    description: "How much your net worth has changed over the last year.",
    formula: "(Net worth now − net worth 1 year ago) ÷ |net worth 1 year ago| × 100",
    whyItMatters: "A single snapshot of net worth doesn't say whether you're moving forward or backward.",
    howToInterpret: "Positive is growth; the color here tracks direction, not a fixed target.",
  },
  fi_progress: {
    description: "How far you are toward having enough invested to stop working.",
    formula: "Net worth ÷ FI number × 100, where FI number = annual expenses ÷ withdrawal rate",
    whyItMatters: "Turns \"financial independence\" from a vague goal into a trackable percentage.",
    howToInterpret: "100% means your assets could theoretically sustain your spending indefinitely at your chosen withdrawal rate.",
  },
  debt_to_income: {
    description: "Total debt measured against how much you earn in a year.",
    formula: "Total liability balance ÷ gross annual income × 100",
    whyItMatters: "A common lens lenders use for overall debt burden, adapted here as a stock-to-flow ratio.",
    howToInterpret: "Under 36% is healthy, above 43% is the classic lending-risk threshold.",
  },
  debt_payoff_runway: {
    description: "How long it would take to pay off all debt at your recent pace.",
    formula: "Total liability balance ÷ average monthly principal reduction (trailing 6 months)",
    whyItMatters: "Turns a debt balance into a timeline, so progress (or stagnation) is obvious.",
    howToInterpret: "Under 36 months is on track, over 84 months means debt is barely moving.",
  },
  net_worth: {
    description: "Everything you own minus everything you owe, right now.",
    formula: "Total assets − total liabilities",
    whyItMatters: "The single most-cited number for overall financial health.",
    howToInterpret: "What matters most is the trend over time, not the absolute number in isolation.",
  },
  debt_to_assets_ratio: {
    description: "How much of what you own is offset by debt.",
    formula: "Total liabilities ÷ total assets × 100",
    whyItMatters: "A pure balance-sheet leverage ratio — meaningful even with irregular income.",
    howToInterpret: "Under 30% is conservative leverage, 50%+ means half your assets are debt-financed.",
  },
  capital_deployment_rate: {
    description: "The share of your monthly cash surplus actually put to work building wealth.",
    formula: "Investment contributions + extra debt principal payments ÷ net income (income − expense) × 100",
    whyItMatters: "Savings rate shows what's left over; this shows where it actually went — idle cash doesn't compound.",
    howToInterpret: "Requires classifying transactions as \"savings\" first. 20%+ means most of your surplus is being deployed, not sitting idle.",
  },
  liquid_runway: {
    description: "How many months your liquid assets could sustain essential spending with zero income.",
    formula: "Liquid balance ÷ average monthly \"needs\" expense",
    whyItMatters: "Sharper than a generic emergency fund figure since it isolates non-discretionary spending.",
    howToInterpret: "Falls back to overall expense until you classify transactions as needs/wants. 6+ months is a strong cushion.",
  },
  savings_efficiency: {
    description: "How much of every dollar you earned actually stuck to your balance sheet.",
    formula: "(Net worth now − net worth 1 year ago) ÷ gross income over the same year × 100",
    whyItMatters: "High income doesn't guarantee wealth-building if it's all spent — this checks whether it converted to net worth.",
    howToInterpret: "20%+ means a fifth of everything earned this year ended up as durable net worth.",
  },
  net_worth_velocity: {
    description: "Whether your net worth is growing faster than your take-home cash flow alone would explain.",
    formula: "(Net worth now − net worth 1 year ago) ÷ net income (income − expense) over the same year × 100",
    whyItMatters: "Above 100% means investment growth is doing real work for you, not just your paycheck.",
    howToInterpret: "Below 0% means net worth shrank despite positive cash flow — usually a market or valuation drop.",
  },
  needs_ratio: {
    description: "The share of income spent on non-discretionary essentials.",
    formula: "Trailing \"needs\"-classified expense ÷ trailing income × 100",
    whyItMatters: "The \"50\" in the 50/30/20 budgeting rule — a classic starting point for a balanced budget.",
    howToInterpret: "Requires classifying transactions first. Green near 50%; far off in either direction usually means the split needs attention (or more classifying).",
  },
  wants_ratio: {
    description: "The share of income spent on discretionary wants.",
    formula: "Trailing \"wants\"-classified expense ÷ trailing income × 100",
    whyItMatters: "The \"30\" in the 50/30/20 rule — tracks lifestyle spending distinct from essentials.",
    howToInterpret: "Requires classifying transactions first. Green near 30%.",
  },
  savings_ratio: {
    description: "The share of income going to savings and investment contributions.",
    formula: "Trailing \"savings\"-classified flow ÷ trailing income × 100",
    whyItMatters: "The \"20\" in the 50/30/20 rule — the portion of income actively building wealth.",
    howToInterpret: "Requires classifying transactions first. Green near 20%; higher is generally fine, it's being too far below target that matters.",
  },
};
