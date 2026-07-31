export const CATEGORY_OPTIONS_BY_BALANCE_TYPE: Record<"asset" | "liability", string[]> = {
  asset: ["Banking", "Investment", "Retirement", "Property"],
  liability: ["Banking", "Loan", "Property"],
};

export const TYPE_OPTIONS_BY_BALANCE_AND_CATEGORY: Record<"asset" | "liability", Record<string, string[]>> = {
  asset: {
    Banking: ["Savings", "Checking", "Other"],
    Investment: ["Brokerage", "529 College Savings", "Health Savings Account", "Money Market", "Other"],
    Retirement: ["401K", "Roth 401K", "Traditional IRA", "Roth IRA", "403(b)", "SEP IRA", "SIMPLE IRA", "Solo 401K", "Other"],
    Property: ["Primary Residence", "Rental Property", "Land", "Other"],
  },
  liability: {
    Banking: ["Credit Card", "Other"],
    Loan: ["Auto Loan", "Personal Loan", "Student Loan", "SBA Loan", "Other"],
    Property: ["HELOC", "Mortgage", "Other"],
  },
};

// Kept for any code that still needs a flat list (e.g. filters); prefer the maps above for forms.
export const ACCOUNT_CATEGORIES = ["Banking", "Investment", "Retirement", "Property", "Loan"];

export const ACCOUNT_TYPES = [
  ...new Set(Object.values(TYPE_OPTIONS_BY_BALANCE_AND_CATEGORY).flatMap((byCategory) => Object.values(byCategory).flat())),
];

export const FLOW_TYPE_OPTIONS: { value: "needs" | "wants" | "savings" | "transfer" | "other"; label: string }[] = [
  { value: "needs", label: "Needs (non-discretionary)" },
  { value: "wants", label: "Wants (discretionary)" },
  { value: "savings", label: "Savings / investing" },
  { value: "transfer", label: "Transfer between accounts" },
  { value: "other", label: "Other" },
];
