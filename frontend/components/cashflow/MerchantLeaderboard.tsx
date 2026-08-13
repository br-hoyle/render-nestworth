"use client";

import { useMemo, useState } from "react";
import type { TransactionRecord } from "@/lib/types";
import { money } from "@/lib/format";

type View = "most_transactions" | "least_transactions" | "highest_total" | "lowest_total" | "average" | "category_share";

const VIEWS: { value: View; label: string }[] = [
  { value: "most_transactions", label: "Most transactions" },
  { value: "least_transactions", label: "Fewest transactions" },
  { value: "highest_total", label: "Highest total" },
  { value: "lowest_total", label: "Lowest total" },
  { value: "average", label: "Average per transaction" },
  { value: "category_share", label: "% of category (this month)" },
];

export function MerchantLeaderboard({ transactions, title }: { transactions: TransactionRecord[]; title?: string }) {
  const [view, setView] = useState<View>("highest_total");
  const [groupFilter, setGroupFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");

  const groups = useMemo(() => [...new Set(transactions.map((t) => t.group).filter(Boolean))] as string[], [transactions]);
  const items = useMemo(() => [...new Set(transactions.map((t) => t.item).filter(Boolean))] as string[], [transactions]);

  const filtered = useMemo(
    () =>
      transactions.filter(
        (t) =>
          t.type === "expense" &&
          (!groupFilter || t.group === groupFilter) &&
          (!itemFilter || t.item === itemFilter)
      ),
    [transactions, groupFilter, itemFilter]
  );

  const perMerchant = useMemo(() => {
    const map = new Map<string, { merchant: string; count: number; total: number; group: string }>();
    for (const t of filtered) {
      if (!t.merchant) continue;
      const entry = map.get(t.merchant) ?? { merchant: t.merchant, count: 0, total: 0, group: t.group || "Other" };
      entry.count += 1;
      entry.total += Math.abs(Number(t.amount));
      map.set(t.merchant, entry);
    }
    return [...map.values()];
  }, [filtered]);

  const currentMonth = useMemo(() => {
    const dates = filtered.map((t) => t.date).sort();
    return dates.length ? dates[dates.length - 1].slice(0, 7) : null;
  }, [filtered]);

  const categoryTotalsThisMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "expense" || t.date.slice(0, 7) !== currentMonth) continue;
      const group = t.group || "Other";
      map.set(group, (map.get(group) ?? 0) + Math.abs(Number(t.amount)));
    }
    return map;
  }, [transactions, currentMonth]);

  const rows = useMemo(() => {
    if (view === "category_share") {
      return perMerchant
        .filter((m) => currentMonth)
        .map((m) => {
          const merchantThisMonth = filtered
            .filter((t) => t.merchant === m.merchant && t.date.slice(0, 7) === currentMonth)
            .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
          const categoryTotal = categoryTotalsThisMonth.get(m.group) ?? 0;
          const pct = categoryTotal > 0 ? (merchantThisMonth / categoryTotal) * 100 : 0;
          return { ...m, metric: pct, display: `${pct.toFixed(0)}% of ${m.group}` };
        })
        .filter((m) => m.metric > 0)
        .sort((a, b) => b.metric - a.metric)
        .slice(0, 10);
    }
    if (view === "average") {
      return [...perMerchant]
        .map((m) => ({ ...m, metric: m.total / m.count, display: money(m.total / m.count) }))
        .sort((a, b) => b.metric - a.metric)
        .slice(0, 10);
    }
    const sorted = [...perMerchant].sort((a, b) => {
      if (view === "most_transactions") return b.count - a.count;
      if (view === "least_transactions") return a.count - b.count;
      if (view === "highest_total") return b.total - a.total;
      return a.total - b.total;
    });
    return sorted.slice(0, 10).map((m) => ({
      ...m,
      metric: view.includes("transactions") ? m.count : m.total,
      display: view.includes("transactions") ? `${m.count} txns` : money(m.total),
    }));
  }, [perMerchant, view, filtered, currentMonth, categoryTotalsThisMonth]);

  const maxMetric = Math.max(1, ...rows.map((r) => r.metric));

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        {title && <span className="text-sm font-medium flex-none">{title}</span>}
        <select
          value={view}
          onChange={(e) => setView(e.target.value as View)}
          className="rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs flex-1 min-w-0"
        >
          {VIEWS.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-nw-muted">Group</span>
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs">
            <option value="">All</option>
            {groups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-nw-muted">Item</span>
          <select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} className="rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs">
            <option value="">All</option>
            {items.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-y-auto">
        {rows.length === 0 && <p className="text-xs text-nw-muted">Not enough data yet.</p>}
        {rows.map((r, i) => (
          <div key={r.merchant} className="flex items-center gap-2 text-sm">
            <span className="w-5 h-5 rounded-full bg-nw-track text-[10px] flex items-center justify-center text-nw-muted flex-none">{i + 1}</span>
            <span className="flex-1 truncate text-xs text-nw-muted" title={r.merchant}>{r.merchant}</span>
            <div className="w-16 h-1.5 rounded-full bg-nw-track overflow-hidden flex-none">
              <div className="h-full bg-nw-green-line" style={{ width: `${(r.metric / maxMetric) * 100}%` }} />
            </div>
            <span className="text-xs text-nw-muted flex-none w-20 text-right">{r.display}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
