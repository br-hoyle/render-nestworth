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

export interface AccountSparkline {
  account_id: string;
  points: { full_date: string; balance: string }[];
}

export interface BalanceGridRow {
  account_id: string;
  account_name: string;
  institution_name: string;
  account_type: string;
  balance_type: BalanceType;
  values: (string | null)[];
}

export interface BalanceGridCategory {
  category: string;
  rows: BalanceGridRow[];
  totals: string[];
}

export interface BalanceGridResponse {
  dates: string[];
  categories: BalanceGridCategory[];
  grand_totals: string[];
}

export interface BalanceHistoryAccount {
  account_id: string;
  account_name: string;
  balance_type: BalanceType;
  values: (string | null)[];
}

export interface BalanceHistoryInstitution {
  institution_name: string;
  accounts: BalanceHistoryAccount[];
}

export interface BalanceHistoryResponse {
  dates: string[];
  net_worth: string[];
  institutions: BalanceHistoryInstitution[];
}

export interface BalanceImportResult {
  inserted_count: number;
  errors: { row_number: number; raw: Record<string, string>; reason: string }[];
}

export interface BulkBalanceImportResult {
  needs_mapping: boolean;
  distinct_accounts: string[] | null;
  inserted_count: number | null;
  skipped_count: number | null;
  errors: { row_number: number; raw: Record<string, string>; reason: string }[];
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

export interface IncomeSeriesPoint {
  date: string;
  gross_monthly: string;
  net_monthly: string | null;
  diff_dollar: string | null;
  diff_pct: number | null;
}

export interface IncomeSeriesResponse {
  points: IncomeSeriesPoint[];
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
  fi_withdrawal_rate: number;
  target_net_worth_savings_rate: number;
  target_net_worth_roi: number;
  household_age: number | null;
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

export interface TransactionListResponse {
  items: TransactionRecord[];
  total: number;
}

export interface UnclassifiedGroup {
  group: string;
  item: string;
  count: number;
  total_amount: string;
}

export interface CategorySummaryRow {
  group: string;
  item: string;
  count: number;
  total_amount: string;
  flow_type: "needs" | "wants" | "savings" | "transfer" | "other" | null;
}

export interface TransactionCategoryRule {
  group: string;
  item: string;
  flow_type: "needs" | "wants" | "savings" | "transfer" | "other";
}

export type KpiColor = "green" | "yellow" | "red" | "coral";

export interface KpiMetric {
  slug: string;
  label: string;
  group: string;
  value: number | null;
  unit: "months" | "percent" | "ratio" | "dollars";
  color: KpiColor;
  progress_pct: number | null;
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
