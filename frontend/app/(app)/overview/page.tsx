"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import type {
  Account,
  BalanceGridCategory,
  BalanceGridResponse,
  KpiMetric,
  NetWorthSeriesResponse,
  ScorecardResponse,
  StaleAccountInfo,
  TransactionListResponse,
  TransactionRecord,
} from "@/lib/types";
import { money, titleCase, computeChangePct, formatMonthYear } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { AllocationSunburst } from "@/components/charts/AllocationSunburst";
import { KpiTile } from "@/components/kpi/KpiTile";
import { KpiDetailPanel } from "@/components/kpi/KpiDetailPanel";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { Button } from "@/components/ui/Button";
import { LoadingBlock } from "@/components/ui/Spinner";

const STICKY_COL = "sticky left-0 z-10";
const SCROLL_SHADOW = "shadow-[6px_0_8px_-6px_rgba(0,0,0,0.6)]";

function aggregateByAccountType(cat: BalanceGridCategory, numDates: number) {
  const byType = new Map<string, { balanceType: "asset" | "liability"; values: number[] }>();
  for (const row of cat.rows) {
    const sign = row.balance_type === "liability" ? -1 : 1;
    if (!byType.has(row.account_type)) {
      byType.set(row.account_type, { balanceType: row.balance_type, values: new Array(numDates).fill(0) });
    }
    const agg = byType.get(row.account_type)!;
    row.values.forEach((v, i) => {
      if (v !== null) agg.values[i] += sign * Number(v);
    });
  }
  return [...byType.entries()]
    .map(([type, agg]) => ({ type, ...agg }))
    .sort((a, b) => Math.abs(b.values[b.values.length - 1] ?? 0) - Math.abs(a.values[a.values.length - 1] ?? 0));
}

function CombinedCategoryTypeTable({ grid }: { grid: BalanceGridResponse }) {
  const [scrolled, setScrolled] = useState(false);
  const dates = grid.dates;
  const shadow = scrolled ? " " + SCROLL_SHADOW : "";

  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Balance by Category</div>
        <Link href="/accounts" className="text-xs text-nw-mint">
          Account Balances →
        </Link>
      </div>
      <div onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 2)} className="overflow-x-auto">
        <table className="text-xs w-full min-w-max border-collapse">
          <thead>
            <tr className="text-nw-muted text-left">
              <th className={STICKY_COL + " bg-nw-surface pr-4 py-2 font-normal whitespace-nowrap" + shadow}>Category / Type</th>
              {dates.map((d) => (
                <th key={d} className="px-3 py-2 font-normal text-right whitespace-nowrap">
                  {d}
                </th>
              ))}
              <th className="px-3 py-2 font-normal text-right whitespace-nowrap">Last Change</th>
              <th className="px-3 py-2 font-normal text-right whitespace-nowrap">Change</th>
            </tr>
          </thead>
          <tbody>
            {grid.categories.flatMap((cat) => {
              const types = aggregateByAccountType(cat, dates.length);
              const categoryTotals = cat.totals.map(Number);
              const catChange = computeChangePct(categoryTotals);
              return [
                <tr key={cat.category} className="border-t border-nw-border font-medium bg-nw-rail">
                  <td className={STICKY_COL + " bg-nw-rail pr-4 py-2 whitespace-nowrap" + shadow}>{titleCase(cat.category)}</td>
                  {categoryTotals.map((t, i) => (
                    <td key={i} className={"px-3 py-2 text-right whitespace-nowrap " + (t < 0 ? "text-nw-coral" : "")}>
                      {money(t)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <ChangeCell pct={catChange.last} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ChangeCell pct={catChange.overall} />
                  </td>
                </tr>,
                ...types.map(({ type, values, balanceType }) => {
                  const change = computeChangePct(values);
                  return (
                    <tr key={cat.category + "-" + type} className="border-t border-nw-border text-nw-muted">
                      <td className={STICKY_COL + " bg-nw-surface pr-4 py-1.5 pl-4 whitespace-nowrap" + shadow}>{titleCase(type)}</td>
                      {values.map((v, i) => (
                        <td
                          key={i}
                          className={"px-3 py-1.5 text-right whitespace-nowrap " + (balanceType === "liability" && v ? "text-nw-coral" : "")}
                        >
                          {money(v)}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-right">
                        <ChangeCell pct={change.last} />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <ChangeCell pct={change.overall} />
                      </td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const RANGES: { label: string; months: number | null }[] = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "12M", months: 12 },
  { label: "24M", months: 24 },
  { label: "All", months: null },
];

const KEY_METRIC_SLUGS = ["emergency_fund", "savings_rate", "net_worth_velocity", "fi_progress", "target_net_worth"];

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

export default function OverviewPage() {
  const { session } = useAuth();
  const welcomeTitle = session ? `Welcome back, ${session.household_name.replace(/^the\s+/i, "")} Household!` : "Welcome back!";
  const [range, setRange] = useState(12);
  const [stale, setStale] = useState<StaleAccountInfo[] | null>(null);
  const [series, setSeries] = useState<NetWorthSeriesResponse | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[] | null>(null);
  const [typeGrid, setTypeGrid] = useState<BalanceGridResponse | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<KpiMetric | null>(null);
  const [dailySeries, setDailySeries] = useState<NetWorthSeriesResponse | null>(null);

  useEffect(() => {
    api.get<StaleAccountInfo[]>("/accounts/stale").then(setStale);
    api.get<Account[]>("/accounts?filter=all").then(setAccounts);
    api.get<ScorecardResponse>("/scorecard").then(setScorecard);
    api.get<TransactionListResponse>(`/transactions?start=${monthsAgo(6)}&limit=1000`).then((res) => setTransactions(res.items));
    api.get<BalanceGridResponse>("/accounts/balance-grid?limit=6").then(setTypeGrid);
    // Day-level series, independent of the range selector, purely to compare the current net
    // worth against the immediately preceding balance point ("BoB") rather than a month bucket.
    api.get<NetWorthSeriesResponse>(`/networth/series?start=${monthsAgo(1)}&granularity=daily`).then(setDailySeries);
  }, []);

  const rangeStart = range === 0 ? "2000-01-01" : monthsAgo(range);
  const rangeEnd = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    api.get<NetWorthSeriesResponse>(`/networth/series?start=${rangeStart}&granularity=actual`).then(setSeries);
  }, [rangeStart]);

  function refetchScorecard() {
    api.get<ScorecardResponse>("/scorecard").then(setScorecard);
  }

  const staleCount = stale?.filter((s) => s.is_stale).length ?? 0;
  const points = series?.net_worth ?? [];
  const latest = points[points.length - 1];
  const previousMonth = points[points.length - 2];
  const netWorthNow = latest ? Number(latest.net_worth) : null;
  const momDelta = latest && previousMonth ? Number(latest.net_worth) - Number(previousMonth.net_worth) : null;

  const dailyPoints = dailySeries?.net_worth ?? [];
  const latestDaily = dailyPoints[dailyPoints.length - 1];
  const previousDaily = dailyPoints[dailyPoints.length - 2];
  const bobDelta = latestDaily && previousDaily ? Number(latestDaily.net_worth) - Number(previousDaily.net_worth) : null;

  const keyMetrics = KEY_METRIC_SLUGS.map((slug) => scorecard?.metrics.find((m) => m.slug === slug)).filter(
    (m): m is KpiMetric => !!m
  );

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

  // One gate covering every fetch this page needs before its first real paint — without
  // it, sections like the Sunburst/Cash Flow chart render `?? []`/`null` mid-flight and
  // show their real "no data yet" copy for a beat even for households with real data.
  const isLoading = stale === null || series === null || accounts === null || scorecard === null || transactions === null;
  if (isLoading) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl mx-auto w-full">
        <h1 className="text-lg font-medium">{welcomeTitle}</h1>
        <LoadingBlock />
      </div>
    );
  }

  if (points.length < 2) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl mx-auto w-full">
        <h1 className="text-lg font-medium">{welcomeTitle}</h1>
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
        <div className="flex items-baseline gap-2 flex-wrap">
          <h1 className="text-lg font-medium">{welcomeTitle}</h1>
        </div>
        <Link href="/update">
          <Button variant="primary">Update balances</Button>
        </Link>
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
            Start Update →
          </Link>
        </div>
      )}

      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
            <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
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
                  {bobDelta !== null && (
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wide text-nw-muted">BoB</div>
                      <div className={bobDelta >= 0 ? "text-nw-green text-sm" : "text-nw-coral text-sm"}>
                        {bobDelta >= 0 ? "+" : ""}
                        {money(bobDelta)}
                      </div>
                    </div>
                  )}
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
              {points.length >= 2 ? (
                <NetWorthChart points={points} />
              ) : (
                <p className="text-xs text-nw-muted">Not enough history yet.</p>
              )}
            </div>
            <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
              <div className="text-sm font-medium">Asset Allocation Today</div>
              <AllocationSunburst accounts={accounts ?? []} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Key Metrics</div>
            <Link href="/trends/scorecard" className="text-xs text-nw-mint">
              KPI Scorecard →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {keyMetrics.map((m) => (
              <KpiTile key={m.slug} metric={m} onClick={() => setSelectedMetric(m)} />
            ))}
          </div>

          {typeGrid && typeGrid.categories.length > 0 && <CombinedCategoryTypeTable grid={typeGrid} />}

          <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">Cash Flow</span>
                <span className="text-xs text-nw-muted">Last 6 Months</span>
              </div>
              <Link href="/trends/cash-flow" className="text-xs text-nw-mint">
                Cash Flow →
              </Link>
            </div>
            {cashflowByMonth.length === 0 ? (
              <p className="text-xs text-nw-muted">No transactions imported yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={cashflowByMonth}>
                  <CartesianGrid stroke="var(--nw-border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: "var(--nw-muted)" }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--nw-border)" }}
                    tickFormatter={formatMonthYear}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={60} tickFormatter={(v) => money(v)} />
                  <Tooltip
                    contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }}
                    labelFormatter={(label) => formatMonthYear(String(label))}
                    formatter={(v) => money(Number(v))}
                  />
                  <Bar dataKey="income" name="Income" fill="var(--nw-green)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="expense" name="Expense" fill="var(--nw-muted)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
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
