"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Account } from "@/lib/types";
import { money } from "@/lib/format";

// Fixed regardless of light/dark theme — a category's color shouldn't shift when the
// household toggles appearance, only the surrounding chrome (tooltip, card) should.
const CATEGORY_COLORS = ["#6ecb88", "#46c063", "#24893c", "#1f5230", "#e8a33d", "#a3ada7"];

export function AllocationSunburst({ accounts, height = 200 }: { accounts: Account[]; height?: number }) {
  const { inner, outer } = useMemo(() => buildRings(accounts), [accounts]);

  if (inner.length === 0) {
    return <div className="text-xs text-nw-muted flex items-center justify-center h-full">No asset data yet</div>;
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <ResponsiveContainer width={height + 40} height={height}>
        <PieChart>
          <Pie
            data={inner}
            dataKey="value"
            nameKey="name"
            innerRadius={height / 6}
            outerRadius={height / 3}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
            {inner.map((d, i) => (
              <Cell key={d.name} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
            ))}
          </Pie>
          <Pie
            data={outer}
            dataKey="value"
            nameKey="label"
            innerRadius={height / 3 + 3}
            outerRadius={height / 2 - 4}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
            {/* Same solid color as the inner ring's matching category — a sub-type is
                distinguished from its siblings by the stroke gap between segments, not by
                fading the fill, so the outer ring reads as the same color family at a glance. */}
            {outer.map((d, i) => (
              <Cell
                key={`${d.category}-${d.type}-${i}`}
                fill={CATEGORY_COLORS[d.categoryIndex % CATEGORY_COLORS.length]}
                stroke="var(--nw-surface)"
                strokeWidth={1}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }}
            itemStyle={{ color: "var(--nw-text)" }}
            labelStyle={{ color: "var(--nw-text)" }}
            formatter={(value, name, item) => {
              const dollar = item?.payload?.dollar;
              const pct = `${Number(value).toFixed(1)}%`;
              return dollar !== undefined ? `${pct} (${money(dollar)})` : pct;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Two pills per row regardless of text length — a fixed 2-column grid rather than
          flex-wrap, so a household with several categories still reads as a compact couple of
          rows instead of one pill per line down the sidebar. */}
      <div className="grid grid-cols-2 gap-1.5 w-full">
        {inner.map((d, i) => (
          <div
            key={d.name}
            className="flex items-center gap-1 text-[10px] rounded-full border border-nw-border px-2 py-0.5 min-w-0"
          >
            <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
            <span className="truncate" title={`${d.name} — ${d.value.toFixed(0)}% · ${money(d.dollar)}`}>
              {d.name}
            </span>
            <span className="text-nw-muted flex-none">{d.value.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildRings(accounts: Account[]) {
  const categoryTotals = new Map<string, number>();
  const typeTotals = new Map<string, Map<string, number>>();

  for (const a of accounts) {
    if (a.balance_type !== "asset" || !a.latest_balance) continue;
    const balance = Number(a.latest_balance);
    categoryTotals.set(a.category, (categoryTotals.get(a.category) ?? 0) + balance);
    if (!typeTotals.has(a.category)) typeTotals.set(a.category, new Map());
    const typeMap = typeTotals.get(a.category)!;
    typeMap.set(a.account_type, (typeMap.get(a.account_type) ?? 0) + balance);
  }

  const grandTotal = [...categoryTotals.values()].reduce((s, v) => s + v, 0);
  if (grandTotal <= 0) return { inner: [], outer: [] };

  const categories = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]);
  const inner = categories.map(([name, value]) => ({ name, value: (value / grandTotal) * 100, dollar: value }));

  const outer: { category: string; type: string; label: string; value: number; dollar: number; categoryIndex: number }[] = [];
  categories.forEach(([category], categoryIndex) => {
    const types = [...(typeTotals.get(category)?.entries() ?? [])].sort((a, b) => b[1] - a[1]);
    types.forEach(([type, value]) => {
      outer.push({
        category,
        type,
        label: `${category} · ${type}`,
        value: (value / grandTotal) * 100,
        dollar: value,
        categoryIndex,
      });
    });
  });

  return { inner, outer };
}
