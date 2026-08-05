"use client";

import { useMemo, useState } from "react";
import type { TransactionRecord } from "@/lib/types";
import { money } from "@/lib/format";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function SpendPatterns({ transactions, title }: { transactions: TransactionRecord[]; title?: string }) {
  const [view, setView] = useState<"weekday" | "month">("weekday");
  const [groupFilter, setGroupFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("");

  const groups = useMemo(() => [...new Set(transactions.map((t) => t.group).filter(Boolean))] as string[], [transactions]);
  const items = useMemo(() => [...new Set(transactions.map((t) => t.item).filter(Boolean))] as string[], [transactions]);
  const merchants = useMemo(() => [...new Set(transactions.map((t) => t.merchant).filter(Boolean))] as string[], [transactions]);

  const filtered = useMemo(
    () =>
      transactions.filter(
        (t) =>
          t.type === "expense" &&
          (!groupFilter || t.group === groupFilter) &&
          (!itemFilter || t.item === itemFilter) &&
          (!merchantFilter || t.merchant === merchantFilter)
      ),
    [transactions, groupFilter, itemFilter, merchantFilter]
  );

  const buckets = useMemo(() => {
    const sums = new Map<number, number>();
    const dateCounts = new Map<number, Set<string>>();
    for (const t of filtered) {
      const d = new Date(t.date + "T00:00:00");
      const key = view === "weekday" ? d.getDay() : d.getMonth();
      sums.set(key, (sums.get(key) ?? 0) + Math.abs(Number(t.amount)));
      if (!dateCounts.has(key)) dateCounts.set(key, new Set());
      dateCounts.get(key)!.add(t.date);
    }
    const labels = view === "weekday" ? WEEKDAYS : MONTHS;
    return labels.map((label, i) => {
      const total = sums.get(i) ?? 0;
      const occurrences = dateCounts.get(i)?.size ?? 0;
      return { label, average: occurrences > 0 ? total / occurrences : 0 };
    });
  }, [filtered, view]);

  const maxAvg = Math.max(1, ...buckets.map((b) => b.average));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        {title && <span className="text-sm font-medium">{title}</span>}
        <div className="flex border border-nw-border rounded-md overflow-hidden text-xs flex-none">
          <button onClick={() => setView("weekday")} className={"px-2 py-1 whitespace-nowrap " + (view === "weekday" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}>
            Weekday
          </button>
          <button onClick={() => setView("month")} className={"px-2 py-1 whitespace-nowrap " + (view === "month" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}>
            Month
          </button>
        </div>
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
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-nw-muted">Merchant</span>
          <select value={merchantFilter} onChange={(e) => setMerchantFilter(e.target.value)} className="rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs">
            <option value="">All</option>
            {merchants.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-nw-muted">Not enough data yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {buckets.map((b) => (
            <div key={b.label} className="flex items-center gap-2 text-xs">
              <span className="w-9 text-nw-muted flex-none">{b.label}</span>
              <div className="flex-1 h-2 rounded-full bg-nw-track overflow-hidden">
                <div className="h-full bg-nw-green-line" style={{ width: `${(b.average / maxAvg) * 100}%` }} />
              </div>
              <span className="w-16 text-right flex-none">{money(b.average)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
