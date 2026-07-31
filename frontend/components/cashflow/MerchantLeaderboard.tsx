"use client";

import { useMemo, useState } from "react";
import type { TransactionRecord } from "@/lib/types";
import { money } from "@/lib/format";

type View = "most_transactions" | "least_transactions" | "highest_total" | "lowest_total" | "category_share";

const VIEWS: { value: View; label: string }[] = [
  { value: "most_transactions", label: "Most transactions" },
  { value: "least_transactions", label: "Fewest transactions" },
  { value: "highest_total", label: "Highest total" },
  { value: "lowest_total", label: "Lowest total" },
  { value: "category_share", label: "% of category (this month)" },
];

export function MerchantLeaderboard({ transactions }: { transactions: TransactionRecord[] }) {
  const [view, setView] = useState<View>("highest_total");

  const perMerchant = useMemo(() => {
    const map = new Map<string, { merchant: string; count: number; total: number; group: string }>();
    for (const t of transactions) {
      if (t.type !== "expense" || !t.merchant) continue;
      const entry = map.get(t.merchant) ?? { merchant: t.merchant, count: 0, total: 0, group: t.group || "Other" };
      entry.count += 1;
      entry.total += Math.abs(Number(t.amount));
      map.set(t.merchant, entry);
    }
    return [...map.values()];
  }, [transactions]);

  const currentMonth = useMemo(() => {
    const dates = transactions.map((t) => t.date).sort();
    return dates.length ? dates[dates.length - 1].slice(0, 7) : null;
  }, [transactions]);

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
          const merchantThisMonth = transactions
            .filter((t) => t.merchant === m.merchant && t.type === "expense" && t.date.slice(0, 7) === currentMonth)
            .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
          const categoryTotal = categoryTotalsThisMonth.get(m.group) ?? 0;
          const pct = categoryTotal > 0 ? (merchantThisMonth / categoryTotal) * 100 : 0;
          return { ...m, metric: pct, display: `${pct.toFixed(0)}% of ${m.group}` };
        })
        .filter((m) => m.metric > 0)
        .sort((a, b) => b.metric - a.metric)
        .slice(0, 8);
    }
    const sorted = [...perMerchant].sort((a, b) => {
      if (view === "most_transactions") return b.count - a.count;
      if (view === "least_transactions") return a.count - b.count;
      if (view === "highest_total") return b.total - a.total;
      return a.total - b.total;
    });
    return sorted.slice(0, 8).map((m) => ({
      ...m,
      metric: view.includes("transactions") ? m.count : m.total,
      display: view.includes("transactions") ? `${m.count} txns` : money(m.total),
    }));
  }, [perMerchant, view, transactions, currentMonth, categoryTotalsThisMonth]);

  const maxMetric = Math.max(1, ...rows.map((r) => r.metric));

  return (
    <div className="flex flex-col gap-3">
      <select value={view} onChange={(e) => setView(e.target.value as View)} className="self-start rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs">
        {VIEWS.map((v) => (
          <option key={v.value} value={v.value}>{v.label}</option>
        ))}
      </select>
      <div className="flex flex-col gap-2">
        {rows.length === 0 && <p className="text-xs text-nw-muted">Not enough data yet.</p>}
        {rows.map((r, i) => (
          <div key={r.merchant} className="flex items-center gap-2 text-sm">
            <span className="w-5 h-5 rounded-full bg-nw-track text-[10px] flex items-center justify-center text-nw-muted flex-none">{i + 1}</span>
            <span className="flex-1 truncate">{r.merchant}</span>
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
