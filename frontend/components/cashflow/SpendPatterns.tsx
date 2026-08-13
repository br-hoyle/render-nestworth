"use client";

import { useMemo, useState } from "react";
import type { TransactionRecord } from "@/lib/types";
import { money } from "@/lib/format";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Every calendar date between start/end (inclusive) — one "instance" of its weekday, e.g.
// each individual Monday in range is its own instance of "Mon".
function eachDateInRange(start: string, end: string): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (cursor <= last) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

// Every (year, month) pair touched by start/end — one instance of that month-of-year per
// year in range, e.g. 2024-01 and 2025-01 are two separate instances of "Jan".
function eachMonthInRange(start: string, end: string): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];
  const cursor = new Date(start + "T00:00:00");
  cursor.setDate(1);
  const last = new Date(end + "T00:00:00");
  while (cursor <= last) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export function SpendPatterns({
  transactions,
  title,
  start,
  end,
}: {
  transactions: TransactionRecord[];
  title?: string;
  // The page's selected date range — needed to know how many instances of each weekday/month
  // actually occurred (including ones with zero spending), not just how many had a transaction.
  start: string;
  end: string;
}) {
  const [view, setView] = useState<"weekday" | "month">("weekday");
  // "all": average over every occurrence of the period in range, zero-spend ones included —
  // "what does a typical Saturday/January cost me overall." "active": average over only the
  // occurrences that actually had a matching transaction — "of the Saturdays I bought
  // groceries, how much did groceries run me." Same numerator, different denominator.
  const [countMode, setCountMode] = useState<"all" | "active">("all");
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

  // The numerator is always the total spend landing in that weekday/month. The denominator —
  // how many occurrences to divide by — is where the two modes differ:
  //   "all"    → every occurrence of the period in the date range, zero-spend ones included
  //              ("what does a typical Saturday cost me overall").
  //   "active" → only the occurrences that actually had a matching transaction
  //              ("of the Saturdays I bought groceries, how much did groceries run me").
  const buckets = useMemo(() => {
    const totals = new Map<number, number>();
    for (const t of filtered) {
      const d = new Date(t.date + "T00:00:00");
      const key = view === "weekday" ? d.getDay() : d.getMonth();
      totals.set(key, (totals.get(key) ?? 0) + Math.abs(Number(t.amount)));
    }
    const occurrenceCounts = new Map<number, number>();
    if (countMode === "all") {
      if (view === "weekday") {
        for (const d of eachDateInRange(start, end)) {
          const key = d.getDay();
          occurrenceCounts.set(key, (occurrenceCounts.get(key) ?? 0) + 1);
        }
      } else {
        for (const { month } of eachMonthInRange(start, end)) {
          occurrenceCounts.set(month, (occurrenceCounts.get(month) ?? 0) + 1);
        }
      }
    } else {
      // Distinct instances (exact dates for weekday, distinct year-months for month) that had
      // at least one matching transaction — a bucket with two purchases on the same Saturday
      // still counts that Saturday once.
      const instancesByBucket = new Map<number, Set<string>>();
      for (const t of filtered) {
        const d = new Date(t.date + "T00:00:00");
        const key = view === "weekday" ? d.getDay() : d.getMonth();
        const instance = view === "weekday" ? t.date : `${d.getFullYear()}-${d.getMonth()}`;
        if (!instancesByBucket.has(key)) instancesByBucket.set(key, new Set());
        instancesByBucket.get(key)!.add(instance);
      }
      for (const [key, instances] of instancesByBucket) occurrenceCounts.set(key, instances.size);
    }
    const labels = view === "weekday" ? WEEKDAYS : MONTHS;
    return labels.map((label, i) => {
      const total = totals.get(i) ?? 0;
      const occurrences = occurrenceCounts.get(i) ?? 0;
      return { label, average: occurrences > 0 ? total / occurrences : 0, occurrences };
    });
  }, [filtered, view, start, end, countMode]);

  const maxAvg = Math.max(1, ...buckets.map((b) => b.average));
  const subject = merchantFilter || itemFilter || groupFilter || "expenses";
  const periodWord = view === "weekday" ? "day" : "month";

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
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
        <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto">
          {buckets.map((b) => (
            <div
              key={b.label}
              className="flex items-center gap-2 text-xs"
              title={
                countMode === "all"
                  ? `Average ${subject} spend across all ${b.occurrences} ${b.label} ${periodWord}${b.occurrences === 1 ? "" : "s"} in this range, including any with no spending`
                  : `Of the ${b.occurrences} ${b.label} ${periodWord}${b.occurrences === 1 ? "" : "s"} where you spent on ${subject}, the average amount incurred`
              }
            >
              <span className="w-9 text-nw-muted flex-none">{b.label}</span>
              <div className="flex-1 h-2 rounded-full bg-nw-track overflow-hidden">
                <div className="h-full bg-nw-green-line" style={{ width: `${(b.average / maxAvg) * 100}%` }} />
              </div>
              <span className="w-16 text-right flex-none text-nw-muted">{money(b.average)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap flex-none">
        <span className="text-[10px] uppercase tracking-wide text-nw-muted">Average over</span>
        <div className="flex border border-nw-border rounded-md overflow-hidden text-xs flex-none">
          <button
            onClick={() => setCountMode("all")}
            className={"px-2 py-1 whitespace-nowrap " + (countMode === "all" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
          >
            Every {view === "weekday" ? "day" : "month"}
          </button>
          <button
            onClick={() => setCountMode("active")}
            className={"px-2 py-1 whitespace-nowrap " + (countMode === "active" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
          >
            Only when spent
          </button>
        </div>
      </div>
    </div>
  );
}
