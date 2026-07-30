"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import type { TransactionRecord } from "@/lib/types";
import { money } from "@/lib/format";

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

export default function CashFlowPage() {
  const [transactions, setTransactions] = useState<TransactionRecord[] | null>(null);

  useEffect(() => {
    api
      .get<TransactionRecord[]>(`/transactions?start=${monthsAgo(12)}&limit=1000`)
      .then(setTransactions);
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
      .map(([month, v]) => ({ month, ...v, net: v.income - v.expense }));
  }, [transactions]);

  const byGroup = useMemo(() => {
    if (!transactions) return [];
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const group = t.group || "Other";
      map.set(group, (map.get(group) ?? 0) + Math.abs(Number(t.amount)));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [transactions]);

  const avgIncome = byMonth.length ? byMonth.reduce((s, m) => s + m.income, 0) / byMonth.length : 0;
  const avgExpense = byMonth.length ? byMonth.reduce((s, m) => s + m.expense, 0) / byMonth.length : 0;
  const avgNet = avgIncome - avgExpense;
  const savingsRate = avgIncome > 0 ? (avgNet / avgIncome) * 100 : null;
  const maxGroup = byGroup[0]?.[1] ?? 1;

  if (transactions?.length === 0) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-3">
        <h1 className="text-lg font-medium">Cash flow</h1>
        <p className="text-sm text-nw-muted">
          Import an EveryDollar export to see cash flow.{" "}
          <Link href="/import" className="text-nw-mint">
            Import CSV
          </Link>{" "}
          — net worth still works without it.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <h1 className="text-lg font-medium">Cash flow</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Tile label="Avg income" value={money(avgIncome)} />
        <Tile label="Avg expense" value={money(avgExpense)} />
        <Tile label="Avg net" value={money(avgNet)} positive={avgNet >= 0} />
        <Tile label="Savings rate" value={savingsRate !== null ? `${savingsRate.toFixed(0)}%` : "—"} />
      </div>

      <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={byMonth}>
            <CartesianGrid stroke="var(--nw-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={60} tickFormatter={(v) => money(v)} />
            <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
            <Bar dataKey="income" fill="var(--nw-green)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="expense" fill="var(--nw-muted)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2 max-w-md">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Spending by group</span>
          <Link href="/transactions" className="text-xs text-nw-mint">
            All transactions →
          </Link>
        </div>
        {byGroup.map(([group, amount]) => (
          <div key={group} className="flex items-center gap-2 text-sm">
            <span className="flex-1">{group}</span>
            <div className="w-24 h-1.5 rounded-full bg-nw-track overflow-hidden">
              <div className="h-full bg-nw-green-line" style={{ width: `${(amount / maxGroup) * 100}%` }} />
            </div>
            <span className="w-16 text-right text-xs">{money(amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-md border border-nw-border bg-nw-surface p-2">
      <div className="text-[10px] uppercase text-nw-muted">{label}</div>
      <div className={"text-base " + (positive === undefined ? "" : positive ? "text-nw-green" : "text-nw-coral")}>{value}</div>
    </div>
  );
}
