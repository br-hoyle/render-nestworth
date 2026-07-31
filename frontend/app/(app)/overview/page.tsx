"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import type {
  Account,
  KpiMetric,
  NetWorthSeriesResponse,
  ScorecardResponse,
  StaleAccountInfo,
  TransactionListResponse,
  TransactionRecord,
} from "@/lib/types";
import { money, titleCase } from "@/lib/format";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { AllocationSunburst } from "@/components/charts/AllocationSunburst";
import { CategoryBreakdownChart } from "@/components/charts/CategoryBreakdownChart";
import { KpiTile } from "@/components/kpi/KpiTile";
import { KpiDetailPanel } from "@/components/kpi/KpiDetailPanel";
import { Button } from "@/components/ui/Button";

const RANGES: { label: string; months: number | null }[] = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "12M", months: 12 },
  { label: "24M", months: 24 },
  { label: "All", months: null },
];

const KEY_METRIC_SLUGS = ["emergency_fund", "savings_rate", "fi_progress", "net_worth_velocity", "capital_deployment_rate"];

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

export default function OverviewPage() {
  const [range, setRange] = useState(12);
  const [stale, setStale] = useState<StaleAccountInfo[] | null>(null);
  const [series, setSeries] = useState<NetWorthSeriesResponse | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[] | null>(null);
  const [breakdownBy, setBreakdownBy] = useState<"category" | "account_type">("category");
  const [selectedMetric, setSelectedMetric] = useState<KpiMetric | null>(null);

  useEffect(() => {
    api.get<StaleAccountInfo[]>("/accounts/stale").then(setStale);
    api.get<Account[]>("/accounts?filter=all").then(setAccounts);
    api.get<ScorecardResponse>("/scorecard").then(setScorecard);
    api.get<TransactionListResponse>(`/transactions?start=${monthsAgo(6)}&limit=1000`).then((res) => setTransactions(res.items));
  }, []);

  useEffect(() => {
    const start = range === 0 ? "2000-01-01" : monthsAgo(range);
    api.get<NetWorthSeriesResponse>(`/networth/series?start=${start}&granularity=monthly`).then(setSeries);
  }, [range]);

  function refetchScorecard() {
    api.get<ScorecardResponse>("/scorecard").then(setScorecard);
  }

  const staleCount = stale?.filter((s) => s.is_stale).length ?? 0;
  const points = series?.net_worth ?? [];
  const latest = points[points.length - 1];
  const previousMonth = points[points.length - 2];
  const netWorthNow = latest ? Number(latest.net_worth) : null;
  const momDelta = latest && previousMonth ? Number(latest.net_worth) - Number(previousMonth.net_worth) : null;

  const keyMetrics = KEY_METRIC_SLUGS.map((slug) => scorecard?.metrics.find((m) => m.slug === slug)).filter(
    (m): m is KpiMetric => !!m
  );

  const breakdown = useMemo(() => {
    if (!series || !accounts) return { totals: [] as { group: string; now: number; delta: number }[], timeSeries: [] as Record<string, number | string>[], groups: [] as string[] };
    const groupByAccount = new Map(accounts.map((a) => [a.account_id, breakdownBy === "category" ? a.category : a.account_type]));
    const totalsNow: Record<string, number> = {};
    const totalsFirst: Record<string, number> = {};
    const byDate: Record<string, Record<string, number>> = {};
    const groupSet = new Set<string>();

    for (const acct of series.accounts) {
      const group = groupByAccount.get(acct.account_id) ?? "Other";
      groupSet.add(group);
      const sign = acct.balance_type === "liability" ? -1 : 1;
      const lastPoint = acct.points[acct.points.length - 1];
      const firstPoint = acct.points[0];
      if (lastPoint) totalsNow[group] = (totalsNow[group] ?? 0) + sign * Number(lastPoint.balance);
      if (firstPoint) totalsFirst[group] = (totalsFirst[group] ?? 0) + sign * Number(firstPoint.balance);

      for (const p of acct.points) {
        const bucket = byDate[p.full_date] ?? (byDate[p.full_date] = {});
        bucket[group] = (bucket[group] ?? 0) + sign * Number(p.balance);
      }
    }

    const groups = [...groupSet];
    const totals = Object.entries(totalsNow).map(([group, now]) => ({
      group,
      now,
      delta: now - (totalsFirst[group] ?? 0),
    }));
    const timeSeries = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, groupValues]) => ({ date, ...groupValues }));

    return { totals, timeSeries, groups };
  }, [series, accounts, breakdownBy]);

  const cashflowByMonth = useMemo(() => {
    if (!transactions) return [];
    const map = new Map<string, { income: number; expense: number }>();
    for (const t of transactions) {
      const month = t.date.slice(0, 7);
      const entry = map.get(month) ?? { income: 0, expense: 0 };
      if (t.type === "income") entry.income += Number(t.amount);
      else entry.expense += Math.abs(Number(t.amount));
      map.set(month, entry);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
  }, [transactions]);

  if (points.length < 2 && series !== null) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-3">
        <h1 className="text-lg font-medium">Overview</h1>
        <p className="text-sm text-nw-muted">
          Record a second balance to see a trend.{" "}
          <Link href="/update" className="text-nw-mint">
            Update balances
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-medium">Overview</h1>
        <div className="flex items-center gap-2 flex-wrap">
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
          <Link href="/update">
            <Button variant="primary">Update balances</Button>
          </Link>
        </div>
      </div>

      {staleCount > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-[#5A4A20] bg-nw-amber-tint px-3 py-2 text-sm text-nw-amber">
          <span className="w-1.5 h-1.5 rounded-full bg-nw-amber flex-none" />
          <span className="flex-1">
            <b className="font-medium">
              {staleCount} account{staleCount === 1 ? "" : "s"} stale
            </b>{" "}
            — net worth below may be understated.
          </span>
          <Link href="/update" className="whitespace-nowrap">
            Start update →
          </Link>
        </div>
      )}

      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
            <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-nw-muted">Net worth</div>
                  <div className="text-2xl font-medium">{netWorthNow !== null ? money(netWorthNow) : "—"}</div>
                </div>
                {momDelta !== null && (
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-nw-muted">MoM</div>
                    <div className={momDelta >= 0 ? "text-nw-green text-sm" : "text-nw-coral text-sm"}>
                      {momDelta >= 0 ? "+" : ""}
                      {money(momDelta)}
                    </div>
                  </div>
                )}
              </div>
              {points.length >= 2 ? (
                <NetWorthChart points={points} />
              ) : (
                <p className="text-xs text-nw-muted">Not enough history yet.</p>
              )}
            </div>
            <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
              <div className="text-sm font-medium">Allocation Today</div>
              <AllocationSunburst accounts={accounts ?? []} />
            </div>
          </div>

          <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm font-medium">Balances by {titleCase(breakdownBy === "category" ? "category" : "type")}</div>
              <div className="flex border border-nw-border rounded-md overflow-hidden text-xs">
                <button
                  onClick={() => setBreakdownBy("category")}
                  className={"px-2.5 py-1 " + (breakdownBy === "category" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
                >
                  Category
                </button>
                <button
                  onClick={() => setBreakdownBy("account_type")}
                  className={"px-2.5 py-1 " + (breakdownBy === "account_type" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
                >
                  Type
                </button>
              </div>
            </div>
            <CategoryBreakdownChart data={breakdown.timeSeries} groups={breakdown.groups} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {breakdown.totals
                .sort((a, b) => b.now - a.now)
                .map((t) => (
                  <div
                    key={t.group}
                    className="flex justify-between items-center gap-2 text-sm rounded-md border border-nw-border px-3 py-2"
                  >
                    <span className="truncate">{t.group}</span>
                    <span className="flex flex-col items-end flex-none">
                      <span>{money(t.now)}</span>
                      <span className={"text-[10px] " + (t.delta >= 0 ? "text-nw-green" : "text-nw-coral")}>
                        {t.delta >= 0 ? "+" : ""}
                        {money(t.delta)}
                      </span>
                    </span>
                  </div>
                ))}
            </div>
          </div>

          <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Cash Flow — Last 6 Months</div>
              <Link href="/trends/cash-flow" className="text-xs text-nw-mint">
                Full cash flow →
              </Link>
            </div>
            {cashflowByMonth.length === 0 ? (
              <p className="text-xs text-nw-muted">No transactions imported yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={cashflowByMonth}>
                  <CartesianGrid stroke="var(--nw-border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={60} tickFormatter={(v) => money(v)} />
                  <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
                  <Bar dataKey="income" fill="var(--nw-green)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="expense" fill="var(--nw-muted)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Key Metrics</div>
            <Link href="/trends/scorecard" className="text-xs text-nw-mint">
              Full scorecard →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {keyMetrics.map((m) => (
              <KpiTile key={m.slug} metric={m} onClick={() => setSelectedMetric(m)} />
            ))}
            {scorecard === null && <p className="text-xs text-nw-muted col-span-full">Loading…</p>}
          </div>
        </div>

        {selectedMetric && (
          <KpiDetailPanel
            metric={selectedMetric}
            onClose={() => setSelectedMetric(null)}
            onSettingsSaved={refetchScorecard}
          />
        )}
      </div>
    </div>
  );
}
