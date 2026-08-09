"use client";

import clsx from "clsx";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { KpiHistoryPoint, KpiMetric } from "@/lib/types";
import { formatMetricValue, KPI_COLOR_HEX, titleCase } from "@/lib/format";
import type { TargetInfo } from "@/lib/kpiThresholds";

// Mirrors backend/app/routers/scorecard.py's _CHART_PROGRESS_PCT_SLUGS — for this one
// metric, the charted history series is itself a percent-to-target (the dollar target barely
// moves month to month), not the metric's own "dollars" unit. Everything else charts its raw
// value in its own natural unit.
const CHART_VALUE_IS_PCT_TO_TARGET = new Set(["target_net_worth"]);

// Rough progress-bar fill so a yellow tile visibly reads as "how far off", not just "not
// green" — approximate positioning, not a precise scale, since thresholds vary per metric.
function trackWidth(metric: KpiMetric, targetInfo: TargetInfo | null): number {
  if (targetInfo) return Math.max(4, Math.min(100, targetInfo.pct));
  if (metric.value === null) return 0;
  if (metric.unit === "percent") return Math.max(4, Math.min(100, metric.value));
  if (metric.unit === "months") return Math.max(4, Math.min(100, (metric.value / 12) * 100));
  if (metric.unit === "ratio") return Math.max(4, Math.min(100, metric.value * 50));
  return 50;
}

// Short axis-tick labels — formatMetricValue's full formatting (e.g. "$2,400,000") is too
// wide for an axis; this trades precision for fitting in a couple dozen pixels.
function compactTick(value: number, unit: string): string {
  switch (unit) {
    case "percent":
      return `${Math.round(value)}%`;
    case "months":
      return `${Math.round(value)}mo`;
    case "ratio":
      return `${value.toFixed(1)}x`;
    case "dollars": {
      const abs = Math.abs(value);
      if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
      if (abs >= 1_000) return `$${Math.round(value / 1000)}k`;
      return `$${Math.round(value)}`;
    }
    default:
      return String(Math.round(value));
  }
}

function ChartTooltip({
  active,
  payload,
  label,
  metric,
  targetInfo,
  chartUnit,
}: {
  active?: boolean;
  payload?: { value: number | null }[];
  label?: string;
  metric: KpiMetric;
  targetInfo: TargetInfo | null;
  chartUnit: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  return (
    <div className="rounded-md border border-nw-border bg-nw-surface px-2.5 py-2 text-[10px] shadow-lg max-w-[160px]">
      <div className="font-medium text-nw-text mb-1 truncate">{titleCase(metric.label)}</div>
      <div className="text-nw-muted">{label}</div>
      <div className="text-nw-text">{value === null || value === undefined ? "—" : formatMetricValue(value, chartUnit)}</div>
      {targetInfo && (
        <div className="mt-1 pt-1 border-t border-nw-border flex flex-col gap-0.5">
          <div className="text-nw-muted">{targetInfo.pct.toFixed(0)}% to target</div>
          <div className="text-nw-muted">Target: {formatMetricValue(targetInfo.target, metric.unit)}</div>
        </div>
      )}
    </div>
  );
}

export function KpiTile({
  metric,
  history,
  targetInfo = null,
  showTrend = false,
  compactChart = false,
  onClick,
}: {
  metric: KpiMetric;
  // Undefined while still loading, [] once loaded with no chartable history.
  history?: KpiHistoryPoint[];
  targetInfo?: TargetInfo | null;
  // Reserves the %-to-target line and chart slot — opt-in so the Scorecard page's richer
  // tiles don't change Overview's more compact Key Metrics tiles, which share this same
  // component but don't fetch history/thresholds for it.
  showTrend?: boolean;
  // Half the normal chart height (64px vs 128px) — per-row/per-group opt-in from the
  // Scorecard page, not tied to any property of the metric itself.
  compactChart?: boolean;
  onClick?: () => void;
}) {
  const points = history ?? [];
  const nonNullCount = points.filter((p) => p.value !== null).length;
  const hasTarget = showTrend && targetInfo !== null;
  const chartUnit = CHART_VALUE_IS_PCT_TO_TARGET.has(metric.slug) ? "percent" : metric.unit;
  const chartData = points.map((p) => ({ date: p.date, value: p.value }));

  return (
    <button
      onClick={onClick}
      className="w-full h-full text-left rounded-lg border border-nw-border bg-nw-surface p-2.5 flex flex-col gap-1 hover:border-nw-line-hi overflow-hidden"
    >
      <div className="text-[10px] uppercase tracking-wide text-nw-muted truncate">{titleCase(metric.label)}</div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-base font-medium">{formatMetricValue(metric.value, metric.unit)}</span>
        <span
          className="w-1.5 h-1.5 rounded-full flex-none"
          style={{ background: KPI_COLOR_HEX[metric.color] }}
        />
      </div>
      {/* Metrics with no target (Total Debt, Net Cash Flow, the Future Balance projections,
          Target Net Worth) show only the name and number above — no bar, no target line, no
          chart — per the household's explicit request that these stay minimal. */}
      {showTrend && hasTarget && (
        <>
          <div className="h-1.5 rounded-full bg-nw-track overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${trackWidth(metric, targetInfo)}%`, background: KPI_COLOR_HEX[metric.color] }}
            />
          </div>
          <div className="h-3 text-[9px] text-nw-muted">
            {targetInfo && `${targetInfo.pct.toFixed(0)}% to target`}
          </div>
          <div className={(compactChart ? "h-16" : "h-32") + " -mx-1"}>
            {nonNullCount <= 1 && (
              <div className="w-full h-full flex items-center justify-center text-center text-[9px] text-nw-muted px-2">
                Not enough history yet
              </div>
            )}
            {nonNullCount > 1 && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 8, fill: "var(--nw-muted)" }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--nw-border)" }}
                    minTickGap={20}
                  />
                  <YAxis
                    tick={{ fontSize: 8, fill: "var(--nw-muted)" }}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    tickFormatter={(v) => compactTick(v, chartUnit)}
                  />
                  <Tooltip
                    content={<ChartTooltip metric={metric} targetInfo={targetInfo} chartUnit={chartUnit} />}
                    cursor={{ stroke: "var(--nw-border)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={KPI_COLOR_HEX[metric.color]}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </button>
  );
}

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-wide text-nw-muted mt-1">{children}</div>;
}

export function colorClass(color: string) {
  return clsx(
    color === "green" && "text-nw-green",
    (color === "red" || color === "coral") && "text-nw-coral",
    color === "yellow" && "text-nw-amber",
    color === "neutral" && "text-nw-muted"
  );
}
