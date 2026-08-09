"use client";

import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { LoadingBlock } from "@/components/ui/Spinner";

interface CategoryTrend {
  label: string;
  points: { month: string; amount: string }[];
  ratio_pct: number | null;
}

const LINE_COLORS = ["var(--nw-green)", "var(--nw-mint)", "var(--nw-amber)", "var(--nw-coral)", "var(--nw-green-line)", "var(--nw-muted)"];

// Ratio of current-month spend to the trailing 6-month average, as a %: under 100% means
// spending less than usual (good), 100–120% is a soft warning, over 120% is a real jump.
function ratioColorClass(ratio: number | null): string {
  if (ratio === null) return "text-nw-muted";
  if (ratio < 100) return "text-nw-green";
  if (ratio <= 120) return "text-nw-amber";
  return "text-nw-coral";
}

// Same trailing-6-month-average ratio as the backend's headline badge, computed for every
// month in the series (not just the latest) so the chart itself reads in % rather than $.
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

export function CategoryDrift({ months = 12, end }: { months?: number; end?: string }) {
  const [mode, setMode] = useState<"group" | "item">("group");
  const [scopeGroup, setScopeGroup] = useState(""); // item mode only: restrict items to one group
  const [selectedLabel, setSelectedLabel] = useState(""); // isolate a single line in the chart

  const [groupTrends, setGroupTrends] = useState<CategoryTrend[] | null>(null);
  const [itemTrends, setItemTrends] = useState<CategoryTrend[] | null>(null);

  useEffect(() => {
    const endParam = end ? `&end=${end}` : "";
    api.get<CategoryTrend[]>(`/cashflow/category-trends?months=${months}${endParam}&mode=group`).then(setGroupTrends);
  }, [months, end]);

  useEffect(() => {
    if (mode !== "item") return;
    const endParam = end ? `&end=${end}` : "";
    const groupParam = scopeGroup ? `&group=${encodeURIComponent(scopeGroup)}` : "";
    setItemTrends(null);
    api.get<CategoryTrend[]>(`/cashflow/category-trends?months=${months}${endParam}&mode=item${groupParam}`).then(setItemTrends);
  }, [months, end, mode, scopeGroup]);

  // Switching mode or the item-mode group scope invalidates whatever single line was isolated.
  useEffect(() => {
    setSelectedLabel("");
  }, [mode, scopeGroup]);

  const trends = mode === "group" ? groupTrends : itemTrends;
  const groupOptions = useMemo(() => (groupTrends ?? []).map((t) => t.label), [groupTrends]);

  const chartData = useMemo(() => {
    if (!trends) return [];
    const byMonth = new Map<string, Record<string, number | null>>();
    for (const t of trends) {
      const ratios = ratioSeries(t.points);
      for (const p of t.points) {
        const row = byMonth.get(p.month) ?? {};
        row[t.label] = ratios.get(p.month) ?? null;
        byMonth.set(p.month, row);
      }
    }
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, values]) => ({ month, ...values }));
  }, [trends]);

  // A ratio needs at least one prior month to compare against — with only one month of
  // transactions on record (or only one month inside the page's date filter), every point is
  // null and the chart would render as an empty plot with no explanation.
  const hasAnyRatio = chartData.some((row) => Object.entries(row).some(([k, v]) => k !== "month" && v !== null));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border border-nw-border rounded-md overflow-hidden text-xs flex-none">
          <button
            onClick={() => setMode("group")}
            className={"px-2.5 py-1 whitespace-nowrap " + (mode === "group" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
          >
            Group
          </button>
          <button
            onClick={() => setMode("item")}
            className={"px-2.5 py-1 whitespace-nowrap " + (mode === "item" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
          >
            Item
          </button>
        </div>
        {mode === "item" && (
          <select
            value={scopeGroup}
            onChange={(e) => setScopeGroup(e.target.value)}
            className="rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs"
          >
            <option value="">All groups</option>
            {groupOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
        <select
          value={selectedLabel}
          onChange={(e) => setSelectedLabel(e.target.value)}
          className="rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs"
        >
          <option value="">{mode === "group" ? "All groups" : "All items"}</option>
          {(trends ?? []).map((t) => (
            <option key={t.label} value={t.label}>
              {t.label}
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
        <>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 11 }}
                itemStyle={{ color: "var(--nw-text)" }}
                labelStyle={{ color: "var(--nw-text)" }}
                formatter={(value) => (value === null ? "—" : `${Number(value).toFixed(0)}%`)}
              />
              {(selectedLabel ? trends.filter((t) => t.label === selectedLabel) : trends).map((t) => {
                const i = trends.indexOf(t);
                return (
                  <Line
                    key={t.label}
                    type="monotone"
                    dataKey={t.label}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    name={t.label}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3">
            {trends.map((t, i) => (
              <div key={t.label} className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full flex-none" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
                <span>{t.label}</span>
                <span className={ratioColorClass(t.ratio_pct)}>{t.ratio_pct === null ? "—" : `${t.ratio_pct.toFixed(0)}%`}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-[10px] text-nw-muted">
        % = current month ÷ trailing 6-month average. Under 100% is on or under pace (green), 100–120% is a soft warning (yellow), over 120% is a
        real jump (red).
      </p>
    </div>
  );
}
