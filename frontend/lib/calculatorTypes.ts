// Shared types for the Retirement & Investment calculators — the per-mode result shapes
// still live next to each bespoke component (they genuinely differ), but the handful of
// truly common shapes (a compounding-frequency choice, a year/age-keyed schedule point) live
// here once instead of being redeclared in every component.

export type CompoundFrequency = "annually" | "semiannually" | "quarterly" | "monthly" | "biweekly" | "weekly" | "daily";
export type ExtendedCompoundFrequency = CompoundFrequency | "continuous";
export type ContributionTiming = "beginning" | "end";

export const FREQUENCY_OPTIONS: { value: CompoundFrequency; label: string }[] = [
  { value: "annually", label: "Annually" },
  { value: "semiannually", label: "Semiannually" },
  { value: "quarterly", label: "Quarterly" },
  { value: "monthly", label: "Monthly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily" },
];

export interface YearBalancePoint {
  year: number;
  balance: number;
}

export interface AgeBalancePoint {
  age: number;
  balance: number;
  phase?: "accumulation" | "drawdown";
}
