import type { KpiHistoryPoint, KpiMetric } from "@/lib/types";

// Single source of truth for which metrics are threshold-graded and which direction is
// "good" — shared by KpiDetailPanel (threshold-editing form) and the Scorecard page
// (computing "% to target" for the tile). Keeping one copy avoids the two drifting apart.
export const HIGHER_IS_BETTER = {
  direction: "higher_is_better" as const,
  keys: ["red_below", "green_at_or_above"],
  labels: ["Red below", "Green at/above"],
};
export const LOWER_IS_BETTER = {
  direction: "lower_is_better" as const,
  keys: ["green_below", "red_at_or_above"],
  labels: ["Green below", "Red at/above"],
};
export const BAND_AROUND_TARGET = {
  direction: "band_around_target" as const,
  keys: ["target", "green_tolerance", "yellow_tolerance"],
  labels: ["Target %", "Green within ±", "Yellow within ±"],
};

type ThresholdConfig = typeof HIGHER_IS_BETTER | typeof LOWER_IS_BETTER | typeof BAND_AROUND_TARGET;

// fi_progress keeps a HIGHER_IS_BETTER entry here so KpiDetailPanel still lets the household
// tune the red/green bands that drive its color — those thresholds are applied backend-side
// to an internal progress_pct, never exposed as a number anymore (and fi_progress no longer
// has its own tile at all — its target is Net Worth's borrowed target instead). targetInfoFor
// below must NOT reuse this entry to compute a target from fi_progress's raw dollar value
// (that would divide a dollar figure by a percent-space threshold) — see
// NO_RAW_TARGET_FROM_THRESHOLD.
export const THRESHOLD_CONFIG: Record<string, ThresholdConfig> = {
  emergency_fund: HIGHER_IS_BETTER,
  liquidity_ratio: HIGHER_IS_BETTER,
  housing_cost_ratio: LOWER_IS_BETTER,
  savings_rate: HIGHER_IS_BETTER,
  debt_to_income: LOWER_IS_BETTER,
  fi_progress: HIGHER_IS_BETTER,
  target_net_worth: HIGHER_IS_BETTER,
  debt_payoff_runway: LOWER_IS_BETTER,
  debt_to_assets_ratio: LOWER_IS_BETTER,
  liquid_runway: HIGHER_IS_BETTER,
  savings_efficiency: HIGHER_IS_BETTER,
  net_worth_velocity: HIGHER_IS_BETTER,
  needs_ratio: BAND_AROUND_TARGET,
  wants_ratio: BAND_AROUND_TARGET,
  discretionary_spending_rate: LOWER_IS_BETTER,
  net_income_rate: HIGHER_IS_BETTER,
  income_growth_rate: HIGHER_IS_BETTER,
  housing_debt_to_equity: LOWER_IS_BETTER,
};

const NO_RAW_TARGET_FROM_THRESHOLD = new Set(["fi_progress"]);

// Metrics whose goal is exactly $0 (or 0%) — total_liabilities and the debt-to-equity ratio
// both trend toward zero as debt is paid off. A ratio against the threshold ("target ÷
// value" or "value ÷ target") degenerates when target=0 (always 0%, or a step-function jump
// to 100% only at the exact instant it's hit), so instead we measure % reduction relative to
// the metric's own oldest charted value — the same 12-month history already fetched for the
// tile's chart, no new backend data needed. Documented as a deliberate design choice (flagged
// to the household) rather than a threshold-config entry, since it needs the history array.
const ZERO_GOAL_FROM_HISTORY_SLUGS = new Set(["total_debt", "total_non_property_debt", "housing_debt_to_equity"]);

export interface TargetInfo {
  pct: number;
  target: number;
}

function zeroGoalFromHistory(metric: KpiMetric, history: KpiHistoryPoint[] | undefined): TargetInfo | null {
  if (metric.value === null) return null;
  const oldest = history?.find((p) => p.value !== null)?.value;
  // No usable baseline (no history yet, or it's been flat at/near zero the whole window) —
  // rather than hiding the chart, treat "already at or below the $0 goal" as fully achieved
  // and "no baseline but currently above zero" as no progress yet, so this metric always
  // gets its chart/bar instead of silently falling back to the no-target minimal tile.
  if (oldest === null || oldest === undefined || oldest <= 0) {
    return { pct: metric.value <= 0 ? 100 : 0, target: 0 };
  }
  const pct = ((oldest - metric.value) / oldest) * 100;
  return { pct, target: 0 };
}

// Net Cash Flow's goal is 15% of income, expressed as a dollar figure — but trailing income
// isn't a value the frontend has directly. It's derived from the Savings Rate sibling metric
// instead (net_cash_flow ÷ (savings_rate ÷ 100) = trailing income), the same "borrow from a
// sibling metric" approach Net Worth uses for its own target, rather than adding a new
// backend field for a number one division already recovers.
function netCashFlowGoal(metric: KpiMetric, allMetrics: KpiMetric[]): TargetInfo | null {
  if (metric.value === null) return null;
  const savingsRate = allMetrics.find((m) => m.slug === "savings_rate");
  if (!savingsRate || savingsRate.value === null || savingsRate.value === 0) return null;
  const income = metric.value / (savingsRate.value / 100);
  const target = income * 0.15;
  if (target <= 0) return null;
  return { pct: Math.min(999, (metric.value / target) * 100), target };
}

// Percent-to-target AND the raw target value (for the tile's %-line and the chart tooltip).
// Cases, in priority order:
//   1. net_worth — its progress_pct is computed backend-side against the FI number, but the
//      FI number itself (the dollar target) isn't on the net_worth metric; it's the headline
//      value of the sibling "fi_progress" (Financial Independence) metric, so borrow it from there.
//      fi_progress itself no longer renders as a tile, but stays in the metrics list as data.
//   2. net_cash_flow — see netCashFlowGoal above.
//   3. ZERO_GOAL_FROM_HISTORY_SLUGS — see zeroGoalFromHistory above.
//   4. Any other metric with a backend-computed progress_pct (e.g. Financial Independence) —
//      its own headline value IS the dollar target, so no threshold lookup is needed.
//   5. Metrics with a HIGHER_IS_BETTER/LOWER_IS_BETTER threshold in the metric's own unit.
// Returns null when none of these apply (e.g. the Future Balance projections, or
// band-around-target metrics) — those metrics have no single "target".
export function targetInfoFor(
  metric: KpiMetric,
  allMetrics: KpiMetric[],
  kpiThresholds: Record<string, Record<string, number>>,
  metricHistory?: KpiHistoryPoint[]
): TargetInfo | null {
  if (metric.slug === "net_worth") {
    if (metric.progress_pct === null || metric.progress_pct === undefined) return null;
    const fiProgress = allMetrics.find((m) => m.slug === "fi_progress");
    if (!fiProgress || fiProgress.value === null) return null;
    return { pct: metric.progress_pct, target: fiProgress.value };
  }

  if (metric.slug === "net_cash_flow") return netCashFlowGoal(metric, allMetrics);

  if (ZERO_GOAL_FROM_HISTORY_SLUGS.has(metric.slug)) return zeroGoalFromHistory(metric, metricHistory);

  if (metric.progress_pct !== null && metric.progress_pct !== undefined) {
    return metric.value !== null ? { pct: metric.progress_pct, target: metric.value } : null;
  }

  if (metric.value === null || NO_RAW_TARGET_FROM_THRESHOLD.has(metric.slug)) return null;

  const config = THRESHOLD_CONFIG[metric.slug];
  const thresholds = kpiThresholds[metric.slug];
  if (!config || !thresholds) return null;

  if (config.direction === "higher_is_better") {
    const target = thresholds["green_at_or_above"];
    if (!target) return null;
    return { pct: Math.min(999, (metric.value / target) * 100), target };
  }
  if (config.direction === "lower_is_better") {
    const target = thresholds["green_below"];
    if (target === undefined) return null;
    const pct = metric.value <= 0 ? 999 : Math.min(999, (target / metric.value) * 100);
    return { pct, target };
  }
  return null;
}
