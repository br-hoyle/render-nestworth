"use client";

import { useEffect, useState } from "react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import type { KpiHistoryResponse, KpiMetric } from "@/lib/types";

const TARGETS: { slug: string; label: string; target: number; color: string }[] = [
  { slug: "needs_ratio", label: "Needs", target: 50, color: "var(--nw-amber)" },
  { slug: "wants_ratio", label: "Wants", target: 30, color: "var(--nw-mint)" },
  { slug: "savings_ratio", label: "Savings", target: 20, color: "var(--nw-green)" },
];

export function BudgetRuleChart({ metrics }: { metrics: KpiMetric[] }) {
  const [history, setHistory] = useState<Record<string, KpiHistoryResponse>>({});

  useEffect(() => {
    TARGETS.forEach((t) => {
      api.get<KpiHistoryResponse>(`/scorecard/${t.slug}/history?months=12`).then((res) =>
        setHistory((h) => ({ ...h, [t.slug]: res }))
      );
    });
  }, []);

  const chartData =
    history.needs_ratio?.points.map((p, i) => ({
      date: p.date,
      needs_ratio: p.value,
      wants_ratio: history.wants_ratio?.points[i]?.value ?? null,
      savings_ratio: history.savings_ratio?.points[i]?.value ?? null,
    })) ?? [];

  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-3">
      <div className="text-sm font-medium">50 / 30 / 20 rule — actual vs. target</div>
      <div className="grid grid-cols-3 gap-2">
        {TARGETS.map((t) => {
          const metric = metrics.find((m) => m.slug === t.slug);
          return (
            <div key={t.slug} className="flex flex-col gap-1 items-center rounded-md border border-nw-border p-2">
              <span className="text-[10px] uppercase text-nw-muted">{t.label}</span>
              <span className="text-lg font-medium" style={{ color: t.color }}>
                {metric?.value !== null && metric?.value !== undefined ? `${metric.value.toFixed(0)}%` : "—"}
              </span>
              <span className="text-[10px] text-nw-muted">target {t.target}%</span>
            </div>
          );
        })}
      </div>
      {chartData.length > 1 && (
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={[0, 100]} />
            <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 11 }} />
            {TARGETS.map((t) => (
              <ReferenceLine key={t.slug} y={t.target} stroke={t.color} strokeDasharray="4 4" strokeOpacity={0.5} />
            ))}
            {TARGETS.map((t) => (
              <Line
                key={t.slug}
                type="monotone"
                dataKey={t.slug}
                stroke={t.color}
                strokeWidth={2}
                dot={false}
                connectNulls
                name={t.label}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
      <p className="text-[10px] text-nw-muted">
        Dashed lines mark the classic 50% needs / 30% wants / 20% savings targets. Classify
        transactions on the Transactions page to populate these.
      </p>
    </div>
  );
}
