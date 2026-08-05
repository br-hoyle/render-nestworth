"use client";

import clsx from "clsx";
import type { KpiMetric } from "@/lib/types";
import { formatMetricValue, KPI_COLOR_HEX, titleCase } from "@/lib/format";

// Rough progress-bar fill so a yellow tile visibly reads as "how far off", not just "not
// green" — approximate positioning, not a precise scale, since thresholds vary per metric.
function trackWidth(metric: KpiMetric): number {
  if (metric.progress_pct !== null && metric.progress_pct !== undefined) {
    return Math.max(4, Math.min(100, metric.progress_pct));
  }
  if (metric.value === null) return 0;
  if (metric.unit === "percent") return Math.max(4, Math.min(100, metric.value));
  if (metric.unit === "months") return Math.max(4, Math.min(100, (metric.value / 12) * 100));
  if (metric.unit === "ratio") return Math.max(4, Math.min(100, metric.value * 50));
  return 50;
}

export function KpiTile({ metric, onClick }: { metric: KpiMetric; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-nw-border bg-nw-surface p-2.5 flex flex-col gap-1 hover:border-nw-line-hi overflow-hidden"
    >
      <div className="text-[10px] uppercase tracking-wide text-nw-muted truncate">{titleCase(metric.label)}</div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-base font-medium">{formatMetricValue(metric.value, metric.unit)}</span>
        <span
          className="w-1.5 h-1.5 rounded-full flex-none"
          style={{ background: KPI_COLOR_HEX[metric.color] }}
        />
      </div>
      <div className="h-1.5 rounded-full bg-nw-track overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${trackWidth(metric)}%`, background: KPI_COLOR_HEX[metric.color] }}
        />
      </div>
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
