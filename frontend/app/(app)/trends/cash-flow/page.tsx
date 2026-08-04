"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
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

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

export default function CashFlowPage() {
  const [transactions, setTransactions] = useState<TransactionRecord[] | null>(null);
  const [needsHistory, setNeedsHistory] = useState<KpiHistoryResponse | null>(null);
  const [wantsHistory, setWantsHistory] = useState<KpiHistoryResponse | null>(null);
  const [spendView, setSpendView] = useState<"group" | "item">("group");
  const [spendGroupFilter, setSpendGroupFilter] = useState("");

  useEffect(() => {
    api
      .get<TransactionListResponse>(`/transactions?start=${monthsAgo(12)}&limit=1000`)
      .then((res) => setTransactions(res.items));
    api.get<KpiHistoryResponse>("/scorecard/needs_ratio/history?months=12").then(setNeedsHistory);
    api.get<KpiHistoryResponse>("/scorecard/wants_ratio/history?months=12").then(setWantsHistory);
  }, []);

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

  const last3Months = byMonth.slice(-3);
  const avgIncome3 = last3Months.length ? last3Months.reduce((s, m) => s + m.income, 0) / last3Months.length : 0;
  const avgExpense3 = last3Months.length ? last3Months.reduce((s, m) => s + m.expense, 0) / last3Months.length : 0;
  const avgNet3 = avgIncome3 - avgExpense3;
  const savingsRate3 = avgIncome3 > 0 ? (avgNet3 / avgIncome3) * 100 : null;

  const spendGroups = useMemo(
    () => [...new Set((transactions ?? []).map((t) => t.group).filter(Boolean))] as string[],
    [transactions]
  );

  const spendRows = useMemo(() => {
    if (!transactions) return [];
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      if (spendView === "item" && spendGroupFilter && t.group !== spendGroupFilter) continue;
      const key = spendView === "group" ? t.group || "Other" : t.item || "Other";
      map.set(key, (map.get(key) ?? 0) + Math.abs(Number(t.amount)));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [transactions, spendView, spendGroupFilter]);

  const maxSpendRow = spendRows[0]?.[1] ?? 1;

  const needsWantsChartData = useMemo(() => {
    if (!needsHistory || !wantsHistory) return [];
    return needsHistory.points.map((p, i) => ({
      date: p.date,
      needs: p.value,
      wants: wantsHistory.points[i]?.value ?? null,
    }));
  }, [needsHistory, wantsHistory]);

  if (transactions?.length === 0) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-3">
        <h1 className="text-lg font-medium">Cash Flow</h1>
        <p className="text-sm text-nw-muted">
          Import an EveryDollar export to see cash flow.{" "}
          <Link href="/transactions" className="text-nw-mint">
            Import CSV
          </Link>{" "}
          — net worth still works without it.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl mx-auto w-full">
      <h1 className="text-lg font-medium">Cash Flow</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigTile label="Avg Income" value={money(avgIncome3)} />
        <BigTile label="Avg Expense" value={money(avgExpense3)} />
        <BigTile label="Avg Net" value={money(avgNet3)} positive={avgNet3 >= 0} />
        <BigTile label="Savings Rate" value={savingsRate3 !== null ? `${savingsRate3.toFixed(0)}%` : "—"} />
      </div>

      <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
        <div className="text-sm font-medium">Monthly Income vs. Expense</div>
        <ResponsiveContainer width="100%" height={220}>
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
              width={40}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }}
              itemStyle={{ color: "var(--nw-text)" }}
              labelStyle={{ color: "var(--nw-text)" }}
              formatter={(value, name) => (name === "Savings Rate" ? [`${Number(value).toFixed(0)}%`, name] : [money(Number(value)), name])}
            />
            <Bar yAxisId="left" dataKey="income" name="Income" fill="var(--nw-green)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            <Bar yAxisId="left" dataKey="expense" name="Expense" fill="var(--nw-muted)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            <Line yAxisId="right" type="monotone" dataKey="savingsRate" name="Savings Rate" stroke="var(--nw-mint)" strokeWidth={2} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-nw-muted">Mint line = savings rate (right axis).</p>
      </div>

      <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
        <div className="text-sm font-medium">Where the Money Flows</div>
        {transactions && <CashFlowSankey transactions={transactions} />}
      </div>

      <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
        <div className="text-sm font-medium">Needs vs. Wants (% of Income)</div>
        {needsWantsChartData.length > 0 && (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={needsWantsChartData}>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 11 }}
                itemStyle={{ color: "var(--nw-text)" }}
                labelStyle={{ color: "var(--nw-text)" }}
              />
              <Line type="monotone" dataKey="needs" stroke="var(--nw-amber)" strokeWidth={2} dot={false} connectNulls name="Needs" />
              <Line type="monotone" dataKey="wants" stroke="var(--nw-mint)" strokeWidth={2} dot={false} connectNulls name="Wants" />
            </LineChart>
          </ResponsiveContainer>
        )}
        <p className="text-[10px] text-nw-muted">Amber = needs, mint = wants. Targets: 50% / 30% (see Scorecard).</p>
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
          {spendView === "item" && (
            <select
              value={spendGroupFilter}
              onChange={(e) => setSpendGroupFilter(e.target.value)}
              className="self-start rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs"
            >
              <option value="">All groups</option>
              {spendGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}
          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
            {spendRows.length === 0 && <p className="text-xs text-nw-muted">No expense data yet.</p>}
            {spendRows.map(([label, amount]) => (
              <div key={label} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{label}</span>
                <div className="w-16 h-1.5 rounded-full bg-nw-track overflow-hidden flex-none">
                  <div className="h-full bg-nw-green-line" style={{ width: `${(amount / maxSpendRow) * 100}%` }} />
                </div>
                <span className="w-16 text-right text-xs flex-none">{money(amount)}</span>
              </div>
            ))}
          </div>
          <Link href="/transactions" className="text-xs text-nw-mint self-end">
            All Transactions →
          </Link>
        </div>

        <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
          <div className="text-sm font-medium">Merchant Spending</div>
          {transactions && <MerchantLeaderboard transactions={transactions} />}
        </div>

        <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
          <div className="text-sm font-medium">Average Spend</div>
          {transactions && <SpendPatterns transactions={transactions} />}
        </div>
      </div>

      <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
        <div className="text-sm font-medium">Category Drift</div>
        <CategoryDrift />
      </div>
    </div>
  );
}

function BigTile({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-md border border-nw-border bg-nw-surface p-3 flex flex-col gap-1">
      <div className="text-[10px] uppercase text-nw-muted">{label}</div>
      <div className={"text-2xl font-medium " + (positive === undefined ? "" : positive ? "text-nw-green" : "text-nw-coral")}>{value}</div>
      <div className="text-[10px] text-nw-muted">Trailing 3-month average</div>
    </div>
  );
}
