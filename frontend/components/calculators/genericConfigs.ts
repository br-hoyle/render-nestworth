import type { CalculatorConfig } from "@/components/calculators/GenericCalculator";

// Configs for the calculators driven by the generic form+results+schedule UI. Amortization,
// Refinance, Mortgage, Mortgage Payoff, House Affordability, Rent vs. Buy (Housing & Mortgage
// redesign), and Interest Rate, Compounding Rate Converter, Savings, Financial Independence
// (Retirement & Investment layout pass) all moved to bespoke components — the remaining entries
// below are simple field-list-in/tiles-out shapes that don't need one.

export const GENERIC_CALCULATORS: Record<string, CalculatorConfig> = {
  "simple-interest": {
    slug: "simple-interest",
    copy: {
      title: "Simple Interest Calculator",
      description: "Interest that accrues on the principal only, with no compounding.",
    },
    fields: [
      { key: "principal", label: "Principal", prefix: "$", default: 1000 },
      { key: "annual_rate", label: "Annual rate", percent: true, default: 0.05 },
      { key: "years", label: "Years", default: 1 },
    ],
    results: [
      { key: "interest", label: "Interest", format: "money" },
      { key: "total", label: "Total", format: "money" },
    ],
  },
  "debt-consolidation": {
    slug: "debt-consolidation",
    copy: {
      title: "Debt Consolidation Calculator",
      description: "See whether rolling your debts into one consolidation loan actually saves money.",
    },
    fields: [
      { key: "new_rate", label: "New blended rate", percent: true, default: 0.1 },
      { key: "new_term_years", label: "New term (years)", default: 5 },
      { key: "loan_origination_fee", label: "Loan origination fee", prefix: "$", default: 0 },
    ],
    debtList: {
      key: "debts",
      rowFields: [
        { key: "balance", label: "Balance", default: 5000 },
        { key: "annual_rate", label: "Annual rate", percent: true, default: 0.18 },
        { key: "monthly_payment", label: "Current monthly payment", default: 150 },
      ],
    },
    results: [
      { key: "total_balance", label: "Total balance", format: "money" },
      { key: "blended_current_rate_pct", label: "Blended current rate", format: "percent" },
      { key: "current_total_monthly_payment", label: "Current total payment", format: "money" },
      { key: "new_monthly_payment", label: "New payment", format: "money" },
      { key: "monthly_savings", label: "Monthly savings", format: "money" },
      { key: "new_total_cost_including_fee", label: "New loan total cost (incl. fee)", format: "money" },
    ],
    hasDefaults: true,
    note: "Prefilled from your open, non-mortgage liability accounts, if you have any — interest rate and payment aren't tracked there, so fill those in.",
  },
  "target-emergency-fund": {
    slug: "target-emergency-fund",
    copy: {
      title: "Target Emergency Fund Calculator",
      description: "Solve for the monthly savings pace needed to reach your emergency-fund goal on schedule.",
    },
    fields: [
      { key: "current_liquid_balance", label: "Current liquid balance", prefix: "$", default: 5000 },
      { key: "monthly_expense", label: "Monthly essential expense", prefix: "$", default: 4000 },
      { key: "target_months", label: "Target months", default: 6 },
      { key: "months_to_reach_goal", label: "Months to reach goal", default: 12 },
    ],
    results: [
      { key: "target_amount", label: "Target amount", format: "money" },
      { key: "shortfall", label: "Shortfall", format: "money" },
      { key: "required_monthly_contribution", label: "Required monthly contribution", format: "money" },
      { key: "already_met", label: "Already met?", format: "text" },
    ],
    hasDefaults: true,
    note: "Complements the Emergency Fund calculator: this solves for the savings pace needed to hit a target, rather than how many months you're covered for today.",
  },
};
