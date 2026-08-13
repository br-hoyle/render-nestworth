"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { chartColorForIndex } from "@/lib/chartColors";
import { LoadingBlock } from "@/components/ui/Spinner";

interface CategoryTrend {
  label: string;
  points: { month: string; amount: string }[];
  ratio_pct: number | null;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

// Stacked monthly totals by Group (or, scoped to one group, by Item) — "how did my spending
// mix shift month to month," as a complement to Category Drift's per-category pace reading.
export function SpendingTrendBars({ months = 12, end }: { months?: number; end?: string }) {
  const [groupTrends, setGroupTrends] = useState<CategoryTrend[] | null>(null);
  const [scopeGroup, setScopeGroup] = useState(""); // "" = stack by Group; else stack by Item within this group
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

  const groupOptions = useMemo(() => (groupTrends ?? []).map((t) => t.label), [groupTrends]);
  const trends = scopeGroup ? itemTrends : groupTrends;

  const chartData = useMemo(() => {
    if (!trends) return [];
    const byMonth = new Map<string, Record<string, number>>();
    for (const t of trends) {
      for (const p of t.points) {
        const row = byMonth.get(p.month) ?? {};
        row[t.label] = Number(p.amount);
        byMonth.set(p.month, row);
      }
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({ month, label: formatMonthLabel(month), ...values }));
  }, [trends]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">Spending by {scopeGroup ? "Item" : "Group"} Over Time</span>
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
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid stroke="var(--nw-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => money(v)} />
              <Tooltip
                contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 11 }}
                itemStyle={{ color: "var(--nw-text)" }}
                labelStyle={{ color: "var(--nw-text)" }}
                formatter={(value, name) => [money(Number(value)), name]}
              />
              {trends.map((t, i) => (
                <Bar key={t.label} dataKey={t.label} name={t.label} stackId="a" fill={chartColorForIndex(i)} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3">
            {trends.map((t, i) => (
              <div key={t.label} className="flex items-center gap-1.5 text-xs" title={t.label}>
                <span className="w-2 h-2 rounded-full flex-none" style={{ background: chartColorForIndex(i) }} />
                <span className="truncate max-w-[140px]">{t.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
