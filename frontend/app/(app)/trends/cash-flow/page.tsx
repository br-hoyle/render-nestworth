"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import type { KpiHistoryResponse, TransactionListResponse, TransactionRecord } from "@/lib/types";
import { money, titleCase } from "@/lib/format";
import { CashFlowSankey } from "@/components/charts/CashFlowSankey";
import { CategoryDrift } from "@/components/cashflow/CategoryDrift";
import { SpendPatterns } from "@/components/cashflow/SpendPatterns";
import { MerchantLeaderboard } from "@/components/cashflow/MerchantLeaderboard";

const RANGES: { label: string; months: number | null }[] = [
  { label: "Last Month", months: 1 },
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "12M", months: 12 },
  { label: "24M", months: 24 },
  { label: "All", months: null },
];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// "Prior N months" means N full calendar months before the current one — if today is
// Dec 15 and you pick 3 months, you get Sep/Oct/Nov, not a 90-day rolling window that bleeds
// into December. "All" is the one exception: it runs through today, current month included.
function computeRange(months: number | null): { start: string; end: string } {
  const today = new Date();
  if (months === null) {
    return { start: "2000-01-01", end: toDateStr(today) };
  }
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(currentMonthStart);
  end.setDate(0); // last day of the previous month
  const start = new Date(currentMonthStart);
  start.setMonth(start.getMonth() - months);
  return { start: toDateStr(start), end: toDateStr(end) };
}

function formatDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function periodLabel(range: number): string {
  if (range === 0) return "All-time average";
  if (range === 1) return "Last month";
  return `${range}-month average`;
}

export default function CashFlowPage() {
  const [range, setRange] = useState(12);
  const [transactions, setTransactions] = useState<TransactionRecord[] | null>(null);
  const [needsHistory, setNeedsHistory] = useState<KpiHistoryResponse | null>(null);
  const [wantsHistory, setWantsHistory] = useState<KpiHistoryResponse | null>(null);
  const [spendView, setSpendView] = useState<"group" | "item">("group");
  const [spendGroupFilter, setSpendGroupFilter] = useState("");
  const [spendItemFilter, setSpendItemFilter] = useState("");
  const [spendMerchantFilter, setSpendMerchantFilter] = useState("");

  // "All" (range === 0) has no fixed lookback — 240 months (20 years) comfortably covers any
  // real household's history without needing an "all time" mode on the history endpoints.
  const historyMonths = range === 0 ? 240 : range;
  const { start, end } = useMemo(() => computeRange(range === 0 ? null : range), [range]);

  useEffect(() => {
    api.get<TransactionListResponse>(`/transactions?start=${start}&end=${end}&limit=1000`).then((res) => setTransactions(res.items));
    api.get<KpiHistoryResponse>(`/scorecard/needs_ratio/history?months=${historyMonths}&end=${end}`).then(setNeedsHistory);
    api.get<KpiHistoryResponse>(`/scorecard/wants_ratio/history?months=${historyMonths}&end=${end}`).then(setWantsHistory);
  }, [range, start, end, historyMonths]);

  const byMonth = useMemo(() => {
    if (!transactions) return [];
    const map = new Map<string, { income: number; expense: number }>();
    for (const t of transactions) {
      const month = t.date.slice(0, 7);
      const entry = map.get(month) ?? { income: 0, expense: 0 };
      if (t.type === "income") entry.income += Number(t.amount);
      else entry.expense += Math.abs(Number(t.amount));
      map.set(month, entry);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        ...v,
        net: v.income - v.expense,
        savingsRate: v.income > 0 ? ((v.income - v.expense) / v.income) * 100 : null,
      }));
  }, [transactions]);

  // The top tiles average over the whole selected range (byMonth is already scoped to it by
  // the transactions fetch above), not a fixed trailing window — so they move with the filter.
  const avgIncome = byMonth.length ? byMonth.reduce((s, m) => s + m.income, 0) / byMonth.length : 0;
  const avgExpense = byMonth.length ? byMonth.reduce((s, m) => s + m.expense, 0) / byMonth.length : 0;
  const avgNet = avgIncome - avgExpense;
  const savingsRate = avgIncome > 0 ? (avgNet / avgIncome) * 100 : null;

  const spendGroups = useMemo(
    () => [...new Set((transactions ?? []).map((t) => t.group).filter(Boolean))] as string[],
    [transactions]
  );
  const spendItems = useMemo(
    () => [...new Set((transactions ?? []).map((t) => t.item).filter(Boolean))] as string[],
    [transactions]
  );
  const spendMerchants = useMemo(
    () => [...new Set((transactions ?? []).map((t) => t.merchant).filter(Boolean))] as string[],
    [transactions]
  );

  const spendRows = useMemo(() => {
    if (!transactions) return [];
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      if (spendGroupFilter && t.group !== spendGroupFilter) continue;
      if (spendItemFilter && t.item !== spendItemFilter) continue;
      if (spendMerchantFilter && t.merchant !== spendMerchantFilter) continue;
      const key = spendView === "group" ? t.group || "Other" : t.item || "Other";
      map.set(key, (map.get(key) ?? 0) + Math.abs(Number(t.amount)));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [transactions, spendView, spendGroupFilter, spendItemFilter, spendMerchantFilter]);

  const maxSpendRow = spendRows[0]?.[1] ?? 1;

  // Needs/wants history points are rolling-window ratios keyed by their own cutoff date, not
  // calendar-month buckets — matched into byMonth's rows by month, so any point outside the
  // range currently on screen (e.g. the current partial month) simply has no row to land in.
  const needsByMonth = useMemo(() => {
    const map = new Map<string, number | null>();
    needsHistory?.points.forEach((p) => map.set(p.date.slice(0, 7), p.value));
    return map;
  }, [needsHistory]);
  const wantsByMonth = useMemo(() => {
    const map = new Map<string, number | null>();
    wantsHistory?.points.forEach((p) => map.set(p.date.slice(0, 7), p.value));
    return map;
  }, [wantsHistory]);

  const combinedChartData = useMemo(
    () =>
      byMonth.map((m) => ({
        ...m,
        needsRate: needsByMonth.get(m.month) ?? null,
        wantsRate: wantsByMonth.get(m.month) ?? null,
      })),
    [byMonth, needsByMonth, wantsByMonth]
  );

  if (transactions?.length === 0) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h1 className="text-lg font-medium">Cash Flow</h1>
          <span className="text-xs text-nw-muted">
            {formatDateLabel(start)} – {formatDateLabel(end)}
          </span>
        </div>
        {range === 0 ? (
          <p className="text-sm text-nw-muted">
            Import an EveryDollar export to see cash flow.{" "}
            <Link href="/transactions" className="text-nw-mint">
              Import CSV
            </Link>{" "}
            — net worth still works without it.
          </p>
        ) : (
          <p className="text-sm text-nw-muted">
            No transactions in this range.{" "}
            <button onClick={() => setRange(0)} className="text-nw-mint">
              Try All →
            </button>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h1 className="text-lg font-medium">Cash Flow</h1>
          <span className="text-xs text-nw-muted">
            {formatDateLabel(start)} – {formatDateLabel(end)}
          </span>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r.months ?? 0)}
              className={
                "px-2.5 py-1 rounded-full text-xs border " +
                ((r.months ?? 0) === range ? "border-nw-green-line text-nw-mint bg-nw-green-tint" : "border-nw-border text-nw-muted")
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigTile label="Avg Income" value={money(avgIncome)} caption={periodLabel(range)} />
        <BigTile label="Avg Expense" value={money(avgExpense)} caption={periodLabel(range)} />
        <BigTile label="Avg Net" value={money(avgNet)} positive={avgNet >= 0} caption={periodLabel(range)} />
        <BigTile label="Savings Rate" value={savingsRate !== null ? `${savingsRate.toFixed(0)}%` : "—"} caption={periodLabel(range)} />
      </div>

      <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
        <div className="text-sm font-medium">Monthly Cash Flow</div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={combinedChartData}>
            <CartesianGrid stroke="var(--nw-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: "var(--nw-muted)" }}
              tickLine={false}
              axisLine={false}
              width={60}
              tickFormatter={(v) => money(v)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "var(--nw-muted)" }}
              tickLine={false}
              axisLine={false}
              width={40}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }}
              itemStyle={{ color: "var(--nw-text)" }}
              labelStyle={{ color: "var(--nw-text)" }}
              formatter={(value, name) =>
                ["Savings Rate", "Needs Rate", "Wants Rate"].includes(String(name))
                  ? [`${Number(value).toFixed(0)}%`, name]
                  : [money(Number(value)), name]
              }
            />
            <Bar yAxisId="left" dataKey="income" name="Income" fill="var(--nw-green)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            <Bar yAxisId="left" dataKey="expense" name="Expense" fill="var(--nw-muted)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            <Line yAxisId="right" type="monotone" dataKey="savingsRate" name="Savings Rate" stroke="var(--nw-green-deep)" strokeWidth={2} dot={false} connectNulls />
            <Line yAxisId="right" type="monotone" dataKey="needsRate" name="Needs Rate" stroke="var(--nw-mint)" strokeWidth={2} dot={false} connectNulls />
            <Line yAxisId="right" type="monotone" dataKey="wantsRate" name="Wants Rate" stroke="var(--nw-amber)" strokeWidth={2} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-3 text-[10px] text-nw-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-none" style={{ background: "var(--nw-green-deep)" }} /> Savings rate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-none" style={{ background: "var(--nw-mint)" }} /> Needs rate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-none" style={{ background: "var(--nw-amber)" }} /> Wants rate
          </span>
          <span>— all % of income. Targets: 50% Needs / 30% Wants</span>
        </div>
      </div>

      <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
        <div className="text-sm font-medium">Where the Money Flows</div>
        {transactions && <CashFlowSankey transactions={transactions} />}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Spending Habits</div>
        <Link href="/transactions" className="text-xs text-nw-mint">
          Transactions →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">Spending by {titleCase(spendView)}</span>
            <div className="flex border border-nw-border rounded-md overflow-hidden text-xs">
              <button
                onClick={() => setSpendView("group")}
                className={"px-2 py-1 " + (spendView === "group" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
              >
                Group
              </button>
              <button
                onClick={() => setSpendView("item")}
                className={"px-2 py-1 " + (spendView === "item" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
              >
                Item
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-nw-muted">Group</span>
              <select
                value={spendGroupFilter}
                onChange={(e) => setSpendGroupFilter(e.target.value)}
                className="rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs"
              >
                <option value="">All</option>
                {spendGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-nw-muted">Item</span>
              <select
                value={spendItemFilter}
                onChange={(e) => setSpendItemFilter(e.target.value)}
                className="rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs"
              >
                <option value="">All</option>
                {spendItems.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-nw-muted">Merchant</span>
              <select
                value={spendMerchantFilter}
                onChange={(e) => setSpendMerchantFilter(e.target.value)}
                className="rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs"
              >
                <option value="">All</option>
                {spendMerchants.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
            {spendRows.length === 0 && <p className="text-xs text-nw-muted">No expense data yet.</p>}
            {spendRows.map(([label, amount], i) => (
              <div key={label} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-nw-track text-[10px] flex items-center justify-center text-nw-muted flex-none">{i + 1}</span>
                <span className="flex-1 truncate">{label}</span>
                <div className="w-16 h-1.5 rounded-full bg-nw-track overflow-hidden flex-none">
                  <div className="h-full bg-nw-green-line" style={{ width: `${(amount / maxSpendRow) * 100}%` }} />
                </div>
                <span className="w-16 text-right text-xs flex-none">{money(amount)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
          {transactions && <MerchantLeaderboard transactions={transactions} title="Merchant Spending" />}
        </div>

        <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
          {transactions && <SpendPatterns transactions={transactions} title="Average Spend" />}
        </div>
      </div>

      <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
        <div className="text-sm font-medium">Category Drift</div>
        <CategoryDrift months={historyMonths} end={end} />
      </div>
    </div>
  );
}

function BigTile({ label, value, positive, caption }: { label: string; value: string; positive?: boolean; caption: string }) {
  return (
    <div className="rounded-md border border-nw-border bg-nw-surface p-3 flex flex-col gap-1">
      <div className="text-[10px] uppercase text-nw-muted">{label}</div>
      <div className={"text-2xl font-medium " + (positive === undefined ? "" : positive ? "text-nw-green" : "text-nw-coral")}>{value}</div>
      <div className="text-[10px] text-nw-muted">{caption}</div>
    </div>
  );
}
