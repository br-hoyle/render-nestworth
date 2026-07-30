export interface SessionInfo {
  household_name: string;
  username: string;
  session_expires_at: number; // unix seconds
  is_owner: boolean;
}

export type BalanceType = "asset" | "liability";

export interface Account {
  account_id: string;
  balance_type: BalanceType;
  institution_name: string;
  category: string;
  account_type: string;
  account_name: string;
  effective_start_date: string;
  effective_end_date: string;
  is_open: boolean;
  latest_balance: string | null;
}

export interface StaleAccountInfo {
  account_id: string;
  account_name: string;
  last_real_date: string | null;
  days_stale: number | null;
  is_stale: boolean;
}

export interface IncomeRecord {
  income_id: string;
  individual: string;
  company: string;
  income: string;
  effective_start_date: string;
  effective_end_date: string;
  is_open: boolean;
}

export interface IncomeConflict {
  income_id: string;
  individual: string;
  company: string;
  effective_start_date: string;
  effective_end_date: string;
  suggested_resolution_end_date: string | null;
}

export interface IncomeSummary {
  as_of: string;
  total_annual_income: string;
  by_individual: Record<string, string>;
}

export interface Balance {
  balance_id: string;
  account_id: string;
  full_date: string;
  balance: string;
}

export interface SeriesPoint {
  full_date: string;
  balance: string;
  is_real: boolean;
}

export interface AccountSeries {
  account_id: string;
  account_name: string;
  balance_type: BalanceType;
  points: SeriesPoint[];
}

export interface NetWorthPoint {
  full_date: string;
  assets: string;
  liabilities: string;
  net_worth: string;
}

export interface NetWorthSeriesResponse {
  net_worth: NetWorthPoint[];
  accounts: AccountSeries[];
}

export interface HouseholdSettings {
  stale_threshold_days: number;
  default_range_months: number;
  liquid_account_types: string[];
  [key: string]: unknown;
}

export interface PreviewRow {
  row_number: number;
  date: string;
  group: string;
  item: string;
  type: string;
  merchant: string;
  account_name: string;
  amount: string;
  note: string;
  fingerprint: string;
}

export interface PreviewErrorRow {
  row_number: number;
  raw: Record<string, string>;
  reason: string;
}

export interface ImportPreviewResponse {
  source_file: string;
  needs_mapping: boolean;
  detected_headers: string[];
  new_rows: PreviewRow[];
  duplicate_rows: PreviewRow[];
  errors: PreviewErrorRow[];
}

export interface TransactionRecord {
  transaction_id: string;
  date: string;
  group: string | null;
  item: string | null;
  type: string;
  merchant: string | null;
  account_name: string | null;
  amount: string;
  note: string | null;
  source_file: string | null;
}

export type KpiColor = "green" | "yellow" | "red" | "coral";

export interface KpiMetric {
  slug: string;
  label: string;
  group: string;
  value: number | null;
  unit: "months" | "percent" | "ratio" | "dollars" | "mix";
  color: KpiColor;
  mix: Record<string, number> | null;
}

export interface ScorecardResponse {
  as_of: string;
  metrics: KpiMetric[];
}

export interface KpiHistoryPoint {
  date: string;
  value: number | null;
}

export interface KpiHistoryResponse {
  slug: string;
  points: KpiHistoryPoint[];
}

export type ScenarioType = "retirement" | "house";

export interface Scenario {
  scenario_id: string;
  scenario_type: ScenarioType;
  scenario_name: string;
  assumptions: Record<string, unknown>;
  created_date: string;
  updated_date: string;
}

export interface ScenarioComparison {
  scenario_id: string;
  scenario_name: string;
  assumptions: Record<string, unknown>;
  result: Record<string, unknown>;
}
