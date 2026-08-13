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
import type { TransactionListResponse, TransactionRecord } from "@/lib/types";
import { money, titleCase } from "@/lib/format";
import { isExcludedCashflowGroup } from "@/lib/cashflowRules";
import { CashFlowSankey } from "@/components/charts/CashFlowSankey";
import { CategoryDrift } from "@/components/cashflow/CategoryDrift";
import { SpendingTrendBars } from "@/components/cashflow/SpendingTrendBars";
import { SpendPatterns } from "@/components/cashflow/SpendPatterns";
import { MerchantLeaderboard } from "@/components/cashflow/MerchantLeaderboard";
import { LoadingBlock } from "@/components/ui/Spinner";

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
  const [spendView, setSpendView] = useState<"group" | "item">("group");
  const [spendGroupFilter, setSpendGroupFilter] = useState("");
  const [spendItemFilter, setSpendItemFilter] = useState("");
  const [spendMerchantFilter, setSpendMerchantFilter] = useState("");

  // "All" (range === 0) has no fixed lookback — 240 months (20 years) comfortably covers any
  // real household's history without needing an "all time" mode on the history endpoints.
  const historyMonths = range === 0 ? 240 : range;
  const { start, end } = useMemo(() => computeRange(range === 0 ? null : range), [range]);

  useEffect(() => {
    let cancelled = false;
    // The transactions API caps a single response at 1000 rows — a wide range (24M, All) can
    // hold several thousand, so a single fetch silently truncated to the most recent 1000,
    // dropping whichever earlier months didn't fit. Page through the full result set instead,
    // so every chart on this page (which all derive from this same array) sees the complete
    // selected range, not just however much fit in the first page.
    async function fetchAllTransactions(): Promise<TransactionRecord[]> {
      const limit = 1000;
      let offset = 0;
      let all: TransactionRecord[] = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await api.get<TransactionListResponse>(`/transactions?start=${start}&end=${end}&limit=${limit}&offset=${offset}`);
        all = all.concat(res.items);
        offset += limit;
        if (offset >= res.total || res.items.length === 0) break;
      }
      // "Savings & Investments" transactions are transfers into asset-building accounts, not
      // spending — excluded here (once, up front) so every chart/tile fed by `transactions`
      // below treats them consistently, instead of each one re-filtering separately.
      return all.filter((t) => !isExcludedCashflowGroup(t.group));
    }
    fetchAllTransactions().then((items) => {
      if (!cancelled) setTransactions(items);
    });
    return () => {
      cancelled = true;
    };
  }, [range, start, end]);

  const byMonth = useMemo(() => {
    if (!transactions) return [];
    const map = new Map<string, { income: number; expense: number; needsExpense: number; wantsExpense: number }>();
    for (const t of transactions) {
      const month = t.date.slice(0, 7);
      const entry = map.get(month) ?? { income: 0, expense: 0, needsExpense: 0, wantsExpense: 0 };
      const amount = Math.abs(Number(t.amount));
      if (t.type === "income") {
        entry.income += Number(t.amount);
      } else {
        entry.expense += amount;
        if (t.flow_type === "needs") entry.needsExpense += amount;
        else if (t.flow_type === "wants") entry.wantsExpense += amount;
      }
      map.set(month, entry);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        income: v.income,
        expense: v.expense,
        net: v.income - v.expense,
        // Same basis as "Where the Money Flows": every rate is a share of INCOME, so
        // Savings% + Needs% + Wants% (+ whatever's unclassified/transfer/savings-flow expense)
        // sum to 100% of that month's income, instead of two different denominators.
        savingsRate: v.income > 0 ? ((v.income - v.expense) / v.income) * 100 : null,
        needsRate: v.income > 0 ? (v.needsExpense / v.income) * 100 : null,
        wantsRate: v.income > 0 ? (v.wantsExpense / v.income) * 100 : null,
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

  if (transactions === null) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl mx-auto w-full">
        <h1 className="text-lg font-medium">Cash Flow</h1>
        <LoadingBlock />
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl mx-auto w-full">
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
          <ComposedChart data={byMonth}>
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
              width={44}
              // Needs/Wants are bounded 0-100 (a share of expense) but Savings Rate can dip
              // negative in a lean month — round to the nearest 10 on both ends (instead of a
              // hard-coded [0, 100]) so a negative or >100 outlier still gets a clean, readable
              // scale instead of an unrounded, overflowing tick value.
              domain={[(min: number) => Math.min(0, Math.floor(min / 10) * 10), (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]}
              tickFormatter={(v) => `${Math.round(v)}%`}
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
            <Bar yAxisId="left" dataKey="income" name="Income" fill="var(--nw-green)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar yAxisId="left" dataKey="expense" name="Expense" fill="#A3ADA7" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            {/* Bars are already green (income) and gray (expense); the overlaid rate lines use
                a brighter green (Savings — distinct from the darker income-bar green), royal
                blue (Needs), and violet (Wants). Thicker (3px) and slightly transparent
                (opacity 0.85, echoing the Sankey's translucent connectors) so they read as an
                overlay on top of the bars rather than competing solid strokes. */}
            <Line yAxisId="right" type="monotone" dataKey="savingsRate" name="Savings Rate" stroke="#1A692E" strokeWidth={3.5} dot={true} connectNulls />
            <Line yAxisId="right" type="monotone" dataKey="needsRate" name="Needs Rate" stroke="var(--nw-chart-3)" strokeWidth={3.5} dot={true} connectNulls />
            <Line yAxisId="right" type="monotone" dataKey="wantsRate" name="Wants Rate" stroke="var(--nw-chart-4)" strokeWidth={3.5} dot={true} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-3 text-[10px] text-nw-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-none" style={{ background: "#47c064" }} /> Savings Rate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-none" style={{ background: "var(--nw-chart-2)" }} /> Needs Rate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-none" style={{ background: "var(--nw-chart-4)" }} /> Wants Rate
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
        {transactions && <CashFlowSankey transactions={transactions} start={start} end={end} />}
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
          <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-y-auto">
            {spendRows.length === 0 && <p className="text-xs text-nw-muted">No expense data yet.</p>}
            {spendRows.slice(0, 10).map(([label, amount], i) => (
              <div key={label} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-nw-track text-[10px] flex items-center justify-center text-nw-muted flex-none">{i + 1}</span>
                <span className="flex-1 truncate text-xs text-nw-muted" title={label}>{label}</span>
                <div className="w-16 h-1.5 rounded-full bg-nw-track overflow-hidden flex-none">
                  <div className="h-full bg-nw-green-line" style={{ width: `${(amount / maxSpendRow) * 100}%` }} />
                </div>
                <span className="w-16 text-right text-xs flex-none text-nw-muted">{money(amount)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
          {transactions && <MerchantLeaderboard transactions={transactions} title="Merchant Spending" />}
        </div>

        <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
          {transactions && <SpendPatterns transactions={transactions} title="Average Spend" start={start} end={end} />}
        </div>
      </div>

      <div className="grid grid-cols-[4fr_3fr] gap-3">
        {/* min-w-0 overrides the grid item's default min-width:auto — without it, a wide
            range (24M/All) makes Category Drift's heatmap table wide enough to blow out its
            own grid track and shove SpendingTrendBars off-screen, instead of scrolling within
            its own card via the overflow-x-auto wrapper inside CategoryDrift. */}
        <div className="min-w-0 rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
          <CategoryDrift months={historyMonths} end={end} />
        </div>
        <div className="min-w-0 rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
          <SpendingTrendBars months={historyMonths} end={end} />
        </div>
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
