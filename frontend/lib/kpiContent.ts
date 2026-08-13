export interface KpiContent {
  description: string;
  formula: string;
  whyItMatters: string;
  howToInterpret: string;
}

export const KPI_CONTENT: Record<string, KpiContent> = {
  emergency_fund: {
    description: "How many months of your \"needs\" (non-discretionary) spending your cash reserves alone could cover.",
    formula: "Cash account balances ÷ average monthly \"needs\" expense",
    whyItMatters: "A thin buffer means one job loss or surprise bill turns into debt — this is the narrowest, most conservative reading of that buffer.",
    howToInterpret: "Falls back to overall expense until you classify transactions as needs/wants. Below 3 months is fragile, 3–6 is building, above 6 is a solid cushion.",
  },
  liquidity_ratio: {
    description: "How many months of expenses your liquid assets (not just cash) could cover, as a ratio.",
    formula: "Liquid account balances ÷ average monthly total expense",
    whyItMatters: "The same figure as Liquid Runway, read as a unitless ratio rather than a month count — useful for a quick above/below-1.0x check.",
    howToInterpret: "Above 1.0x means you have at least a month of total expenses sitting in liquid assets.",
  },
  housing_cost_ratio: {
    description: "The share of net (banked) income going to housing.",
    formula: "Monthly housing expense ÷ monthly net income × 100",
    whyItMatters: "Lenders and budgeting rules of thumb use a gross-income version of this; using net income here reads a bit higher for the same housing cost, since net is smaller than gross.",
    howToInterpret: "Under 28% is comfortable, 28–36% is tight, above that is a red flag — adjust the thresholds if your net-vs-gross gap makes these feel off.",
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
    description: "The net worth you'd need to cover your spending indefinitely (25× annual expenses, or your chosen withdrawal rate).",
    formula: "Target = annual expenses ÷ withdrawal rate",
    whyItMatters: "Turns your expenses into a concrete net-worth number to aim for, not just a vague savings goal.",
    howToInterpret: "This tile shows the target figure only — your progress toward it is on the Net Worth tile instead.",
  },
  debt_to_income: {
    description: "Your estimated recurring monthly debt payment measured against your monthly gross income.",
    formula: "Estimated payment = trailing 3-month average liability paydown pace; DTI = payment ÷ monthly gross income × 100",
    whyItMatters: "The classic lending-risk lens — but the schema has no loan-payment field, so the \"payment\" here is inferred from how fast your total debt is actually shrinking.",
    howToInterpret: "Under 36% is healthy, above 43% is the classic lending-risk threshold. Reads as unavailable if debt isn't currently trending down.",
  },
  debt_payoff_runway: {
    description: "How long it would take to pay off all debt at your recent pace.",
    formula: "Total liability balance ÷ average monthly principal reduction (trailing 6 months)",
    whyItMatters: "Turns a debt balance into a timeline, so progress (or stagnation) is obvious.",
    howToInterpret: "Under 36 months is on track, over 84 months means debt is barely moving.",
  },
  net_worth: {
    description: "Everything you own minus everything you owe, right now — plus how close that is to your Target Net Worth (the 25×-expenses FI number).",
    formula: "Total assets − total liabilities; progress = net worth ÷ Target Net Worth × 100",
    whyItMatters: "The single most-cited number for overall financial health, now paired with a concrete goalpost instead of standing alone.",
    howToInterpret: "What matters most is the trend over time. The color stays tied to solvency (negative net worth is always coral) — the progress bar and % are about the FI goal, not a pass/fail on the number itself.",
  },
  debt_to_assets_ratio: {
    description: "How much of what you own is offset by debt.",
    formula: "Total liabilities ÷ total assets × 100",
    whyItMatters: "A pure balance-sheet leverage ratio — meaningful even with irregular income.",
    howToInterpret: "Under 30% is conservative leverage, 50%+ means half your assets are debt-financed.",
  },
  target_net_worth: {
    description: "The net worth you'd have today if you'd saved a fixed share of income every month since age 20, growing at an expected rate of return.",
    formula: "Future value of a monthly savings annuity: (income ÷ 12 × savings rate), compounded monthly from age 20 to today",
    whyItMatters: "A benchmark grounded in your own income and age, rather than a generic rule of thumb — shows whether you're ahead of or behind a steady savings pace.",
    howToInterpret: "Requires a birthdate set in Settings (or a manually-entered age, as a fallback). 100%+ means you're at or ahead of the pace this savings rate and return would imply.",
  },
  liquid_runway: {
    description: "How many months your liquid assets (checking, savings, and similar) could sustain your total spending with zero income.",
    formula: "Liquid balance ÷ average monthly total expense",
    whyItMatters: "The broadest liquidity read — every liquid dollar against every expense dollar, not just cash against essentials.",
    howToInterpret: "6+ months is a strong cushion. Compare against Emergency Fund (cash only, needs only) and Liquidity Ratio (same figure, shown as a ratio) for a fuller liquidity picture.",
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
  total_debt: {
    description: "The raw dollar total of every liability you owe, right now.",
    formula: "Sum of all liability account balances",
    whyItMatters: "A single headline number for how much debt exists before looking at ratios or payoff pace.",
    howToInterpret: "Informational only — there's no universal \"good\" total since it scales with income and assets. Watch the trend, not the level.",
  },
  total_non_property_debt: {
    description: "Every liability except mortgages, HELOCs, and other property-secured debt.",
    formula: "Total liabilities − property-secured liabilities",
    whyItMatters: "Property debt is roughly offset by the home's value; this is the debt that isn't, so it reads as the more urgent payoff target.",
    howToInterpret: "Informational only, same $0-goal treatment as Total Debt — watch the trend, not the level.",
  },
  net_cash_flow: {
    description: "How many dollars were left over (or short) after income and expenses over the trailing window.",
    formula: "Average Trailing income − Average Trailing expense",
    whyItMatters: "The dollar version of Savings Rate — easier to compare against a specific bill or goal.",
    howToInterpret: "Positive means you banked money this period; negative means you spent more than you earned.",
  },
  discretionary_spending_rate: {
    description: "The share of income going to non-essential, discretionary spending.",
    formula: "Trailing \"wants\"-classified expense ÷ trailing income × 100",
    whyItMatters: "Lifestyle spending is usually the most flexible lever for freeing up cash without cutting essentials.",
    howToInterpret: "Requires classifying transactions first. Under 30% is lean, 45%+ means discretionary spending dominates the budget.",
  },
  net_income_rate: {
    description: "The share of your on-paper gross income that actually shows up as banked income.",
    formula: "Trailing net (banked) income ÷ trailing gross income (annualized) × 100",
    whyItMatters: "The gap between gross and net is taxes, benefits, and retirement deductions — this shows how much of that gap exists.",
    howToInterpret: "70%+ is a typical take-home share after tax and deductions; well below that may mean high withholding or unrecorded income.",
  },
  income_growth_rate: {
    description: "Your year-over-year raise (or pay cut), smoothed across a full 12 months rather than one month's snapshot.",
    formula: "(Average monthly income, trailing 12mo ÷ average monthly income, the 12 months before that) − 1, × 100",
    whyItMatters: "Comparing two 12-month averages instead of one month against a trend absorbs bonuses, side income, or a single unusual month — this reads as an actual raise pace, not month-to-month noise.",
    howToInterpret: "0% means flat income year over year; needs 24+ months of transaction history to compute at all. This also feeds the default \"Annual Raise\" assumption in the Retirement Need and 401(k) calculators.",
  },
  housing_debt_to_equity: {
    description: "How much mortgage debt you're carrying relative to the equity you've built in your property.",
    formula: "Property-category liabilities ÷ (property-category assets − property-category liabilities) × 100",
    whyItMatters: "A new mortgage starts highly leveraged; this ratio should fall over time as equity builds through paydown and appreciation.",
    howToInterpret: "Under 100% means your equity exceeds your mortgage balance; very high early on is normal, not alarming, if it's trending down.",
  },
  future_investment_balance: {
    description: "A projection of what your taxable investment accounts could be worth by your target retirement age.",
    formula: "Current Investment-category balance, compounded monthly at your expected return rate, plus a flat monthly contribution, from your age to your target retirement age",
    whyItMatters: "Turns today's balance and a savings habit into a concrete future number, rather than an abstract goal.",
    howToInterpret: "Requires a birthdate set in Settings (or a manually-entered age, as a fallback), plus target retirement age, expected return, and monthly contribution in this tile's assumptions.",
  },
  future_retirement_balance: {
    description: "A projection of what your tax-advantaged retirement accounts could be worth at your target retirement age.",
    formula: "Current Retirement-category balance, compounded monthly at your expected return rate, plus a flat monthly contribution, from your age to your target retirement age",
    whyItMatters: "The retirement-account counterpart to Future Investment Balance — shows whether current contributions are on track for a real number at retirement.",
    howToInterpret: "Requires a birthdate set in Settings (or a manually-entered age, as a fallback), plus target retirement age, expected return, and monthly contribution in this tile's assumptions.",
  },
};
