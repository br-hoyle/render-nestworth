// Mirrors backend/app/services/cashflow_rules.py — "Savings & Investments" transactions
// are transfers into asset-building accounts, not spending, so the Cash Flow page ignores
// them entirely (income and expense alike) rather than counting them as an expense.
export const EXCLUDED_CASHFLOW_GROUP = "savings & investments";

export function isExcludedCashflowGroup(group: string | null | undefined): boolean {
  return (group ?? "").trim().toLowerCase() === EXCLUDED_CASHFLOW_GROUP;
}
