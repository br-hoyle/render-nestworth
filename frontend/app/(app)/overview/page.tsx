"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { KpiMetric, NetWorthSeriesResponse, ScorecardResponse, StaleAccountInfo } from "@/lib/types";
import { money } from "@/lib/format";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { AllocationDonut } from "@/components/charts/AllocationDonut";
import { KpiTile } from "@/components/kpi/KpiTile";
import { Button } from "@/components/ui/Button";

const KEY_METRIC_SLUGS = ["savings_rate", "emergency_fund", "debt_to_income", "housing_cost_ratio", "fi_progress"];

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

export default function OverviewPage() {
  const [stale, setStale] = useState<StaleAccountInfo[] | null>(null);
  const [series, setSeries] = useState<NetWorthSeriesResponse | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);

  useEffect(() => {
    api.get<StaleAccountInfo[]>("/accounts/stale").then(setStale);
    api
      .get<NetWorthSeriesResponse>(`/networth/series?start=${monthsAgo(12)}&granularity=monthly`)
      .then(setSeries);
    api.get<ScorecardResponse>("/scorecard").then(setScorecard);
  }, []);

  const staleCount = stale?.filter((s) => s.is_stale).length ?? 0;
  const points = series?.net_worth ?? [];
  const latest = points[points.length - 1];
  const previousMonth = points[points.length - 2];
  const netWorthNow = latest ? Number(latest.net_worth) : null;
  const momDelta = latest && previousMonth ? Number(latest.net_worth) - Number(previousMonth.net_worth) : null;

  const keyMetrics = KEY_METRIC_SLUGS.map((slug) => scorecard?.metrics.find((m) => m.slug === slug)).filter(
    (m): m is KpiMetric => !!m
  );
  const allocationMix = scorecard?.metrics.find((m) => m.slug === "allocation_mix")?.mix ?? {};

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
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-medium">Overview</h1>
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
            Start update →
          </Link>
        </div>
      )}

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
          <div className="text-sm font-medium">Allocation today</div>
          <AllocationDonut mix={allocationMix} />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Key metrics</div>
        <Link href="/trends/scorecard" className="text-xs text-nw-mint">
          Full scorecard →
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {keyMetrics.map((m) => (
          <KpiTile key={m.slug} metric={m} />
        ))}
        {scorecard === null && <p className="text-xs text-nw-muted col-span-full">Loading…</p>}
      </div>
    </div>
  );
}
