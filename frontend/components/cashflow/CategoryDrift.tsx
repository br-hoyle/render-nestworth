"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { LoadingBlock } from "@/components/ui/Spinner";

interface CategoryTrend {
  label: string;
  points: { month: string; amount: string }[];
  ratio_pct: number | null;
}

// Same trailing-6-month-average pace reading as the backend's headline badge, computed for
// every month in the series (not just the latest).
function ratioSeries(points: { month: string; amount: string }[]): Map<string, number | null> {
  const amounts = points.map((p) => Number(p.amount));
  const map = new Map<string, number | null>();
  points.forEach((p, i) => {
    const prior = amounts.slice(Math.max(0, i - 6), i);
    const priorAvg = prior.length ? prior.reduce((s, v) => s + v, 0) / prior.length : null;
    map.set(p.month, priorAvg ? (amounts[i] / priorAvg) * 100 : null);
  });
  return map;
}

// Diverging scale centered on 100% (on pace): under pace shades toward green, over pace
// shades toward coral, intensity scaling with how far off pace it is — a blank/gray cell
// means no prior-month baseline exists yet to compare against.
function cellBackground(ratio: number | null): string {
  if (ratio === null) return "var(--nw-track)";
  const deviation = Math.max(-100, Math.min(100, ratio - 100));
  const intensity = Math.abs(deviation) / 100;
  const base = deviation < 0 ? "var(--nw-green)" : "var(--nw-coral)";
  const mixPct = Math.round(12 + intensity * 60);
  return `color-mix(in srgb, ${base} ${mixPct}%, var(--nw-track))`;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

export function CategoryDrift({ months = 12, end }: { months?: number; end?: string }) {
  // "" = stack by Group; else drill into that group's Items — same single-dropdown pattern as
  // SpendingTrendBars' "Spending by Group Over Time" chart, instead of a separate mode toggle
  // plus a conditional scope select.
  const [scopeGroup, setScopeGroup] = useState("");

  const [groupTrends, setGroupTrends] = useState<CategoryTrend[] | null>(null);
  const [itemTrends, setItemTrends] = useState<CategoryTrend[] | null>(null);

  useEffect(() => {
    const endParam = end ? `&end=${end}` : "";
    api.get<CategoryTrend[]>(`/cashflow/category-trends?months=${months}${endParam}&mode=group`).then(setGroupTrends);
  }, [months, end]);

  useEffect(() => {
    if (!scopeGroup) return;
    const endParam = end ? `&end=${end}` : "";
    setItemTrends(null);
    api.get<CategoryTrend[]>(`/cashflow/category-trends?months=${months}${endParam}&mode=item&group=${encodeURIComponent(scopeGroup)}`).then(setItemTrends);
  }, [months, end, scopeGroup]);

  const trends = scopeGroup ? itemTrends : groupTrends;
  const groupOptions = useMemo(() => (groupTrends ?? []).map((t) => t.label), [groupTrends]);

  // Rows keep the backend's own highest-spend-first order. Columns are every month touched by
  // any row, oldest to newest — a row missing an early month (a category that only started
  // appearing partway through the range) just renders a blank cell there.
  const { rows, monthColumns } = useMemo(() => {
    if (!trends) return { rows: [], monthColumns: [] as string[] };
    const monthSet = new Set<string>();
    const rows = trends.map((t) => {
      const ratios = ratioSeries(t.points);
      const amountByMonth = new Map(t.points.map((p) => [p.month, Number(p.amount)]));
      t.points.forEach((p) => monthSet.add(p.month));
      return { label: t.label, ratios, amountByMonth, latestRatio: t.ratio_pct };
    });
    return { rows, monthColumns: [...monthSet].sort() };
  }, [trends]);

  const hasAnyRatio = rows.some((r) => monthColumns.some((m) => r.ratios.get(m) !== null && r.ratios.get(m) !== undefined));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">Category Drift</span>
        <select
          value={scopeGroup}
          onChange={(e) => setScopeGroup(e.target.value)}
          className="rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs"
        >
          <option value="">All groups (stacked)</option>
          {groupOptions.map((g) => (
            <option key={g} value={g}>
              {g} — by item
            </option>
          ))}
        </select>
      </div>

      {trends === null ? (
        <LoadingBlock className="py-6" />
      ) : trends.length === 0 ? (
        <p className="text-xs text-nw-muted">No expense history yet.</p>
      ) : !hasAnyRatio ? (
        <p className="text-xs text-nw-muted">
          Not enough month-over-month history yet — a pace needs at least one prior month of transactions to compare against. Widen the date range
          above or import more history.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="border-separate border-spacing-[3px] text-xs mx-1">
            <thead>
              <tr>
                <th className="sticky left-0 bg-nw-surface text-left font-normal text-nw-muted text-[10px] pr-2 align-bottom pb-1">Category</th>
                {monthColumns.map((m) => (
                  <th key={m} className="font-normal text-nw-muted text-[9px] align-bottom pb-1 whitespace-nowrap px-0.5">
                    {formatMonthLabel(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="sticky left-0 bg-nw-surface text-nw-text truncate max-w-[120px] pr-2" title={r.label}>
                    {r.label}
                  </td>
                  {monthColumns.map((m) => {
                    const ratio = r.ratios.get(m) ?? null;
                    const amount = r.amountByMonth.get(m);
                    return (
                      <td
                        key={m}
                        className="w-9 h-6 text-center align-middle rounded-[3px] text-[10px] font-medium"
                        style={{ background: cellBackground(ratio), color: "var(--nw-text)" }}
                        title={
                          amount === undefined
                            ? `${r.label} — ${formatMonthLabel(m)}: no spending`
                            : `${r.label} — ${formatMonthLabel(m)}: ${money(amount)}` +
                              (ratio === null ? "" : ` (${ratio.toFixed(0)}% of trailing 6-month average)`)
                        }
                      >
                        {ratio === null ? "" : Math.round(ratio)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-2 text-[10px] text-nw-muted flex-wrap">
        <span>Pace vs. trailing 6-month average:</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-[2px] flex-none" style={{ background: cellBackground(50) }} /> well under
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-[2px] flex-none" style={{ background: cellBackground(100) }} /> on pace
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-[2px] flex-none" style={{ background: cellBackground(150) }} /> well over
        </span>
        <span>— numbers are % of that average; hover a cell for the dollar amount.</span>
      </div>
    </div>
  );
}
