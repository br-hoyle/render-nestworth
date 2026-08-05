import type { CalculatorConfig } from "@/components/calculators/GenericCalculator";

// Configs for the calculators driven by the generic form+results+schedule UI. The 7
// original calculators keep their bespoke hand-written components (already built, already
// tested against real data) — this covers the backlog-pass-2 additions only.

export const LOAN_LIKE_FIELDS = [
  { key: "principal", label: "Principal", default: 20000 },
  { key: "annual_rate", label: "Annual rate", percent: true, default: 0.07 },
  { key: "term_years", label: "Term (years)", default: 5 },
];

export const GENERIC_CALCULATORS: Record<string, CalculatorConfig> = {
  loan: {
    slug: "loan",
    fields: LOAN_LIKE_FIELDS,
    results: [
      { key: "monthly_payment", label: "Monthly payment", format: "money" },
      { key: "total_interest", label: "Total interest", format: "money" },
      { key: "total_paid", label: "Total paid", format: "money" },
    ],
    scheduleKey: "yearly_schedule",
    scheduleXKey: "year",
    scheduleYKey: "balance",
  },
  repayment: {
    slug: "repayment",
    fields: LOAN_LIKE_FIELDS,
    results: [
      { key: "monthly_payment", label: "Monthly payment", format: "money" },
      { key: "total_interest", label: "Total interest", format: "money" },
      { key: "total_paid", label: "Total paid", format: "money" },
    ],
    scheduleKey: "yearly_schedule",
    scheduleXKey: "year",
    scheduleYKey: "balance",
  },
  "student-loan": {
    slug: "student-loan",
    fields: [
      { key: "principal", label: "Principal", default: 30000 },
      { key: "annual_rate", label: "Annual rate", percent: true, default: 0.055 },
      { key: "term_years", label: "Term (years)", default: 10 },
    ],
    results: [
      { key: "monthly_payment", label: "Monthly payment", format: "money" },
      { key: "total_interest", label: "Total interest", format: "money" },
      { key: "total_paid", label: "Total paid", format: "money" },
    ],
    scheduleKey: "yearly_schedule",
    scheduleXKey: "year",
    scheduleYKey: "balance",
  },
  amortization: {
    slug: "amortization",
    fields: LOAN_LIKE_FIELDS,
    results: [
      { key: "monthly_payment", label: "Monthly payment", format: "money" },
      { key: "total_interest", label: "Total interest", format: "money" },
      { key: "total_paid", label: "Total paid", format: "money" },
    ],
    scheduleKey: "yearly_schedule",
    scheduleXKey: "year",
    scheduleYKey: "balance",
    hasDefaults: true,
    note: "Prefilled from your mortgage account, if you have one — but works for any loan.",
  },
  refinance: {
    slug: "refinance",
    fields: [
      { key: "current_balance", label: "Current balance", default: 300000 },
      { key: "current_rate", label: "Current rate", percent: true, default: 0.07 },
      { key: "current_remaining_years", label: "Years remaining", default: 25 },
      { key: "new_rate", label: "New rate", percent: true, default: 0.055 },
      { key: "new_term_years", label: "New term (years)", default: 30 },
      { key: "closing_costs", label: "Closing costs", default: 4000 },
    ],
    results: [
      { key: "current_payment", label: "Current payment", format: "money" },
      { key: "new_payment", label: "New payment", format: "money" },
      { key: "monthly_savings", label: "Monthly savings", format: "money" },
      { key: "breakeven_months", label: "Breakeven", format: "months" },
      { key: "lifetime_interest_saved", label: "Lifetime interest saved", format: "money" },
    ],
  },
  "interest-rate": {
    slug: "interest-rate",
    fields: [
      { key: "principal", label: "Principal", default: 200000 },
      { key: "target_monthly_payment", label: "Monthly payment", default: 1500 },
      { key: "term_years", label: "Term (years)", default: 30 },
    ],
    results: [
      { key: "annual_rate_pct", label: "Implied annual rate", format: "percent" },
      { key: "total_paid", label: "Total paid", format: "money" },
      { key: "total_interest", label: "Total interest", format: "money" },
    ],
  },
  "roth-ira": {
    slug: "roth-ira",
    fields: [
      { key: "current_balance", label: "Current balance", default: 10000 },
      { key: "annual_contribution", label: "Annual contribution", default: 7000 },
      { key: "years", label: "Years", default: 20 },
      { key: "annual_rate", label: "Annual return", percent: true, default: 0.07 },
    ],
    results: [
      { key: "final_balance", label: "Final balance", format: "money" },
      { key: "total_contributions", label: "Total contributions", format: "money" },
      { key: "total_growth", label: "Total growth", format: "money" },
    ],
    scheduleKey: "schedule",
    scheduleXKey: "year",
    scheduleYKey: "balance",
    note: "Contribution is capped at the modeled $7,000/yr limit (a simplification — real IRS limits change yearly).",
  },
  ira: {
    slug: "ira",
    fields: [
      { key: "current_balance", label: "Current balance", default: 10000 },
      { key: "annual_contribution", label: "Annual contribution", default: 7000 },
      { key: "years", label: "Years", default: 20 },
      { key: "annual_rate", label: "Annual return", percent: true, default: 0.07 },
    ],
    results: [
      { key: "final_balance", label: "Final balance", format: "money" },
      { key: "total_contributions", label: "Total contributions", format: "money" },
      { key: "total_growth", label: "Total growth", format: "money" },
    ],
    scheduleKey: "schedule",
    scheduleXKey: "year",
    scheduleYKey: "balance",
    note: "Models pre-tax growth only — not the up-front deduction or ordinary-income tax on withdrawal.",
  },
  "simple-interest": {
    slug: "simple-interest",
    fields: [
      { key: "principal", label: "Principal", default: 1000 },
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
    fields: [
      { key: "new_rate", label: "New blended rate", percent: true, default: 0.1 },
      { key: "new_term_years", label: "New term (years)", default: 5 },
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
    ],
  },
  "financial-independence": {
    slug: "financial-independence",
    fields: [
      { key: "current_net_worth", label: "Current net worth", default: 100000 },
      { key: "annual_savings", label: "Annual savings", default: 30000 },
      { key: "annual_expenses", label: "Annual expenses", default: 60000 },
      { key: "expected_return", label: "Expected return", percent: true, default: 0.07 },
      { key: "withdrawal_rate", label: "Withdrawal rate", percent: true, default: 0.04 },
    ],
    results: [
      { key: "fi_number", label: "FI number", format: "money" },
      { key: "years_to_fi", label: "Years to FI" },
      { key: "already_fi", label: "Already FI?", format: "text" },
    ],
    scheduleKey: "schedule",
    scheduleXKey: "year",
    scheduleYKey: "balance",
    hasDefaults: true,
    note: "Distinct from the Retirement calculator: this answers \"when am I FI\", not \"will my drawdown last\".",
  },
  "debt-acceleration": {
    slug: "debt-acceleration",
    fields: [{ key: "extra_payment", label: "Extra monthly payment", default: 200 }],
    debtList: {
      key: "debts",
      rowFields: [
        { key: "balance", label: "Balance", default: 5000 },
        { key: "annual_rate", label: "Annual rate", percent: true, default: 0.2 },
        { key: "minimum_payment", label: "Minimum payment", default: 100 },
      ],
    },
    results: [
      { key: "avalanche_months", label: "Avalanche: months" },
      { key: "avalanche_total_interest", label: "Avalanche: interest", format: "money" },
      { key: "snowball_months", label: "Snowball: months" },
      { key: "snowball_total_interest", label: "Snowball: interest", format: "money" },
      { key: "months_saved_avalanche", label: "Months saved (avalanche)" },
    ],
    note: "Avalanche pays the highest-rate debt first; snowball pays the smallest balance first. Extra payment cascades to the priority debt each month.",
  },
  "target-emergency-fund": {
    slug: "target-emergency-fund",
    fields: [
      { key: "current_liquid_balance", label: "Current liquid balance", default: 5000 },
      { key: "monthly_expense", label: "Monthly essential expense", default: 4000 },
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
  investment: {
    slug: "investment",
    fields: [
      { key: "principal", label: "Starting amount", default: 10000 },
      { key: "monthly_contribution", label: "Monthly contribution", default: 500 },
      { key: "annual_rate", label: "Expected annual return", percent: true, default: 0.07 },
      { key: "years", label: "Years", default: 20 },
    ],
    results: [
      { key: "final_balance", label: "Final balance", format: "money" },
      { key: "total_contributions", label: "Total contributions", format: "money" },
      { key: "total_growth", label: "Total growth", format: "money" },
    ],
    scheduleKey: "schedule",
    scheduleXKey: "year",
    scheduleYKey: "balance",
  },
  "compound-interest": {
    slug: "compound-interest",
    fields: [
      { key: "principal", label: "Principal", default: 5000 },
      { key: "monthly_contribution", label: "Monthly addition", default: 0 },
      { key: "annual_rate", label: "Annual rate", percent: true, default: 0.05 },
      { key: "years", label: "Years", default: 10 },
    ],
    results: [
      { key: "final_balance", label: "Final balance", format: "money" },
      { key: "total_growth", label: "Total growth", format: "money" },
    ],
    scheduleKey: "schedule",
    scheduleXKey: "year",
    scheduleYKey: "balance",
  },
  savings: {
    slug: "savings",
    fields: [
      { key: "principal", label: "Starting amount", default: 0 },
      { key: "monthly_contribution", label: "Monthly savings", default: 300 },
      { key: "annual_rate", label: "Annual rate", percent: true, default: 0.04 },
      { key: "years", label: "Years", default: 5 },
    ],
    results: [
      { key: "final_balance", label: "Final balance", format: "money" },
      { key: "total_contributions", label: "Total contributions", format: "money" },
    ],
    scheduleKey: "schedule",
    scheduleXKey: "year",
    scheduleYKey: "balance",
  },
};
