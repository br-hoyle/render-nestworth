"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Account, NetWorthSeriesResponse } from "@/lib/types";
import { money } from "@/lib/format";
import { NetWorthChart } from "@/components/charts/NetWorthChart";

const RANGES: { label: string; months: number | null }[] = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "12M", months: 12 },
  { label: "24M", months: 24 },
  { label: "All", months: null },
];

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

export default function NetWorthPage() {
  const [range, setRange] = useState(12);
  const [series, setSeries] = useState<NetWorthSeriesResponse | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);

  useEffect(() => {
    const start = range === 0 ? "2000-01-01" : monthsAgo(range);
    api.get<NetWorthSeriesResponse>(`/networth/series?start=${start}&granularity=monthly`).then(setSeries);
    api.get<Account[]>("/accounts?filter=all").then(setAccounts);
  }, [range]);

  const points = series?.net_worth ?? [];
  const latest = points[points.length - 1];
  const first = points[0];

  const categoryTotals = useMemo(() => {
    if (!series || !accounts) return [];
    const categoryByAccount = new Map(accounts.map((a) => [a.account_id, a.category]));
    const totalsNow: Record<string, number> = {};
    const totalsFirst: Record<string, number> = {};
    for (const acct of series.accounts) {
      const category = categoryByAccount.get(acct.account_id) ?? "Other";
      const sign = acct.balance_type === "liability" ? -1 : 1;
      const lastPoint = acct.points[acct.points.length - 1];
      const firstPoint = acct.points[0];
      if (lastPoint) totalsNow[category] = (totalsNow[category] ?? 0) + sign * Number(lastPoint.balance);
      if (firstPoint) totalsFirst[category] = (totalsFirst[category] ?? 0) + sign * Number(firstPoint.balance);
    }
    return Object.entries(totalsNow).map(([category, now]) => ({
      category,
      now,
      delta: now - (totalsFirst[category] ?? 0),
    }));
  }, [series, accounts]);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-medium">Net worth</h1>
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

      {points.length < 2 && series !== null ? (
        <p className="text-sm text-nw-muted">Record a second balance to see a trend.</p>
      ) : (
        <>
          <div className="flex gap-6 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-nw-muted">Net worth</div>
              <div className="text-xl font-medium">{latest ? money(latest.net_worth) : "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-nw-muted">Assets</div>
              <div className="text-base">{latest ? money(latest.assets) : "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-nw-muted">Liabilities</div>
              <div className="text-base text-nw-coral">{latest ? money(latest.liabilities) : "—"}</div>
            </div>
          </div>

          <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
            <NetWorthChart points={points} height={260} />
          </div>

          <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2 max-w-md">
            <div className="text-sm font-medium">Change by category</div>
            {categoryTotals.map((c) => (
              <div key={c.category} className="flex justify-between text-sm">
                <span>{c.category}</span>
                <span className={c.delta >= 0 ? "text-nw-green" : "text-nw-coral"}>
                  {c.delta >= 0 ? "+" : ""}
                  {money(c.delta)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
