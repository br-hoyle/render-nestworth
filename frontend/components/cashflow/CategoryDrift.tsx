"use client";

import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

interface CategoryTrend {
  group: string;
  points: { month: string; amount: string }[];
  drift_pct: number | null;
}

const LINE_COLORS = ["var(--nw-green)", "var(--nw-mint)", "var(--nw-amber)", "var(--nw-coral)", "var(--nw-green-line)", "var(--nw-muted)"];

export function CategoryDrift() {
  const [trends, setTrends] = useState<CategoryTrend[] | null>(null);
  const [groupFilter, setGroupFilter] = useState("");

  useEffect(() => {
    api.get<CategoryTrend[]>("/cashflow/category-trends?months=12").then(setTrends);
  }, []);

  const chartData = useMemo(() => {
    if (!trends) return [];
    const byMonth = new Map<string, Record<string, number | null>>();
    for (const t of trends) {
      for (const p of t.points) {
        const row = byMonth.get(p.month) ?? {};
        row[t.group] = Number(p.amount);
        byMonth.set(p.month, row);
      }
    }
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, values]) => ({ month, ...values }));
  }, [trends]);

  if (trends === null) return <p className="text-xs text-nw-muted">Loading…</p>;
  if (trends.length === 0) return <p className="text-xs text-nw-muted">No expense history yet.</p>;

  const visible = groupFilter ? trends.filter((t) => t.group === groupFilter) : trends;

  return (
    <div className="flex flex-col gap-3">
      <select
        value={groupFilter}
        onChange={(e) => setGroupFilter(e.target.value)}
        className="self-start rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs"
      >
        <option value="">All groups</option>
        {trends.map((t) => (
          <option key={t.group} value={t.group}>
            {t.group}
          </option>
        ))}
      </select>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData}>
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={60} tickFormatter={(v) => money(v)} />
          <Tooltip
            contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 11 }}
            itemStyle={{ color: "var(--nw-text)" }}
            labelStyle={{ color: "var(--nw-text)" }}
            formatter={(value) => money(Number(value))}
          />
          {visible.map((t, i) => (
            <Line
              key={t.group}
              type="monotone"
              dataKey={t.group}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
              name={t.group}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3">
        {trends.map((t, i) => (
          <div key={t.group} className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full flex-none" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
            <span>{t.group}</span>
            <span
              className={
                t.drift_pct === null
                  ? "text-nw-muted"
                  : t.drift_pct > 15
                  ? "text-nw-coral"
                  : t.drift_pct < -15
                  ? "text-nw-green"
                  : "text-nw-muted"
              }
            >
              {t.drift_pct === null ? "—" : `${t.drift_pct >= 0 ? "+" : ""}${t.drift_pct.toFixed(0)}%`}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-nw-muted">
        Drift = latest month vs. the prior 3-month average. A category creeping well above its recent trend is flagged coral; one trending down is
        green.
      </p>
    </div>
  );
}
