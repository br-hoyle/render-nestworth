export const CATEGORY_OPTIONS_BY_BALANCE_TYPE: Record<"asset" | "liability", string[]> = {
  asset: ["Banking", "Investment", "Retirement", "Property"],
  liability: ["Banking", "Loan", "Property"],
};

export const TYPE_OPTIONS_BY_BALANCE_AND_CATEGORY: Record<"asset" | "liability", Record<string, string[]>> = {
  asset: {
    Banking: [
      "Checking",
      "Savings",
      "High-Yield Savings",
      "Certificate of Deposit",
      "Money Market",
      "Cash",
      "Other",
    ],
    Investment: [
      "Brokerage",
      "529 College Savings",
      "Health Savings Account",
      "Crypto Wallet",
      "Other",
    ],
    Retirement: [
      "401(k)",
      "Roth 401(k)",
      "Traditional IRA",
      "Roth IRA",
      "403(b)",
      "457(b)",
      "SEP IRA",
      "SIMPLE IRA",
      "Solo 401(k)",
      "Pension",
      "Annuity",
      "Other",
    ],
    Property: [
      "Primary Residence",
      "Secondary Residence",
      "Rental Property",
      "Commercial Property",
      "Land",
      "Other",
    ],
  },
  liability: {
    Banking: [
      "Credit Card",
      "Overdraft Line of Credit",
      "Personal Line of Credit",
      "Other",
    ],
    Loan: [
      "Auto Loan",
      "Personal Loan",
      "Student Loan",
      "401(k) Loan",
      "Margin Debt",
      "SBA Loan",
      "Other",
    ],
    Property: [
      "Mortgage",
      "Secondary Mortgage",
      "HELOC",
      "Home Equity Loan",
      "Construction Loan",
      "Land Loan",
      "Other",
    ],
  },
};

// Kept for any code that still needs a flat list (e.g. filters); prefer the maps above for forms.
export const ACCOUNT_CATEGORIES = ["Banking", "Investment", "Retirement", "Property", "Loan"];

export const ACCOUNT_TYPES = [
  ...new Set(Object.values(TYPE_OPTIONS_BY_BALANCE_AND_CATEGORY).flatMap((byCategory) => Object.values(byCategory).flat())),
];

export const FLOW_TYPE_OPTIONS: { value: "needs" | "wants" | "savings" | "transfer" | "other"; label: string }[] = [
  { value: "needs", label: "Needs (Non-Discretionary)" },
  { value: "wants", label: "Wants (Discretionary)" },
  { value: "savings", label: "Savings / Investing" },
  { value: "transfer", label: "Transfer between Accounts" },
  { value: "other", label: "Other" },
];
