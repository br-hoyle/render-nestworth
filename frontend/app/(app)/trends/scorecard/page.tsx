"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AllKpiHistoryResponse, HouseholdSettings, KpiMetric, ScorecardResponse } from "@/lib/types";
import { KpiTile } from "@/components/kpi/KpiTile";
import { KpiDetailPanel } from "@/components/kpi/KpiDetailPanel";
import { targetInfoFor } from "@/lib/kpiThresholds";
import { LoadingBlock } from "@/components/ui/Spinner";

const GROUPS = [
  "Liquidity & Emergency Reserves",
  "Debt & Leverage Management",
  "Cash Flow & Budgeting Efficiency",
  "Wealth Accumulation & Balance Sheet Health",
  "Retirement & Financial Independence",
];

// Explicit per-row layout for the two groups the household re-ordered by hand — each row is
// an exact, ordered slug list rendered at uniform width (not derived from flex-wrap, which
// is content-width-dependent and can't guarantee "this exact tile order, in these exact
// rows"). `compact` halves that row's chart height. Groups not listed here fall back to the
// generic flex-wrap + computed row-size layout below.
const GROUP_ROW_LAYOUT: Record<string, { slugs: string[]; compact: boolean }[]> = {
  "Debt & Leverage Management": [
    { slugs: ["total_debt", "debt_payoff_runway", "debt_to_assets_ratio"], compact: false },
    { slugs: ["total_non_property_debt", "housing_debt_to_equity", "debt_to_income"], compact: true },
  ],
  "Cash Flow & Budgeting Efficiency": [
    { slugs: ["net_cash_flow", "net_income_rate", "savings_rate", "discretionary_spending_rate"], compact: true },
    { slugs: ["income_growth_rate", "housing_cost_ratio", "savings_efficiency"], compact: false },
  ],
};

// Groups (outside the explicit-row ones above) whose charts are uniformly halved, per the
// household's request — Wealth Accumulation's generic-grid tiles, and every tile in the
// Retirement group's bespoke stacked layout below.
const COMPACT_CHART_GROUPS = new Set(["Wealth Accumulation & Balance Sheet Health", "Retirement & Financial Independence"]);

// Tiles per row: never more than 4, never fewer than 2. Prefers whichever of 4/3/2 divides
// the group evenly (so a group of 6 renders as two rows of 3, not a row of 4 and a row of
// 2), and otherwise falls back to the largest size that still avoids a stray 1-tile row.
function rowSize(count: number): 2 | 3 | 4 {
  if (count <= 4) return Math.max(count, 2) as 2 | 3 | 4;
  for (const r of [4, 3, 2] as const) {
    if (count % r === 0) return r;
  }
  for (const r of [4, 3, 2] as const) {
    const rows = Math.ceil(count / r);
    const lastRowSize = count - r * (rows - 1);
    if (lastRowSize >= 2) return r;
  }
  return 4;
}

// Mobile always caps at 2 per row (consistent with Overview's Key Metrics grid); desktop
// targets the computed ideal row size. Built with flex-wrap + basis + grow rather than a
// fixed-column grid: `grow` lets a trailing partial row's tiles stretch to fill the full
// row width (e.g. a group of 5 renders 3 full-width tiles, then 2 tiles that each expand to
// half the row) instead of leaving empty space where a 4th/3rd tile would have gone.
// Basis values subtract this row's share of the `gap-2` (8px) via calc() — a plain
// percentage basis ignores gap entirely, so N items at exactly 100%/N overflow by the
// gap width and the last one wraps early onto its own line.
const BASIS: Record<2 | 3 | 4, string> = {
  2: "basis-[calc(50%_-_4px)]",
  3: "basis-[calc(50%_-_4px)] md:basis-[calc(33.3333%_-_5.3333px)]",
  4: "basis-[calc(50%_-_4px)] md:basis-[calc(25%_-_6px)]",
};

export default function ScorecardPage() {
  const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);
  const [history, setHistory] = useState<AllKpiHistoryResponse | null>(null);
  const [kpiThresholds, setKpiThresholds] = useState<Record<string, Record<string, number>> | null>(null);
  const [selected, setSelected] = useState<KpiMetric | null>(null);

  function load() {
    api.get<ScorecardResponse>("/scorecard").then(setScorecard);
  }

  useEffect(() => {
    load();
    // One batched history call for every tile's inline sparkline, instead of each tile
    // fetching its own — mirrors /accounts/sparklines' same avoid-N+1 pattern.
    api.get<AllKpiHistoryResponse>("/scorecard/history?months=12").then(setHistory);
    api.get<HouseholdSettings>("/settings").then((s) => {
      setKpiThresholds((s.kpi_thresholds as Record<string, Record<string, number>>) ?? {});
    });
  }, []);

  // Gates the whole page so tiles don't first render with a "Not enough history yet"
  // chart placeholder and target-less bars, then flash to their real content once
  // /scorecard/history and /settings resolve a beat after /scorecard itself.
  const isLoading = scorecard === null || history === null || kpiThresholds === null;
  const metrics = scorecard?.metrics ?? [];

  function renderTile(m: KpiMetric, compact: boolean) {
    const metricHistory = history?.series[m.slug];
    const info = targetInfoFor(m, metrics, kpiThresholds ?? {}, metricHistory);
    return (
      <KpiTile
        key={m.slug}
        metric={m}
        history={metricHistory}
        targetInfo={info}
        showTrend
        compactChart={compact}
        onClick={() => setSelected(m)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl mx-auto w-full">
        <h1 className="text-lg font-medium">Scorecard</h1>
        <LoadingBlock />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl mx-auto w-full">
      <h1 className="text-lg font-medium">Scorecard</h1>

      <div className="flex flex-col gap-4">
        {GROUPS.map((group) => {
          // fi_progress ("Target Net Worth") is removed as a tile per the household's
          // explicit request — Net Worth borrows its dollar target instead (see
          // targetInfoFor) — but it stays in `metrics` (unfiltered) so that lookup keeps
          // working; it's only excluded from what actually renders here.
          const groupMetrics = metrics.filter((m) => m.group === group && m.slug !== "fi_progress");
          if (groupMetrics.length === 0) return null;

          const rowLayout = GROUP_ROW_LAYOUT[group];
          if (rowLayout) {
            return (
              <div key={group} className="flex flex-col gap-2">
                <div className="text-[10px] uppercase tracking-wide text-nw-muted">{group}</div>
                {rowLayout.map((row, i) => (
                  <div key={i} className="flex gap-2 items-stretch">
                    {row.slugs.map((slug) => {
                      const m = groupMetrics.find((gm) => gm.slug === slug);
                      if (!m) return null;
                      return (
                        <div key={slug} className="flex-1 min-w-0">
                          {renderTile(m, row.compact)}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          }

          if (group === "Retirement & Financial Independence") {
            const financialIndependence = groupMetrics.find((m) => m.slug === "target_net_worth");
            const stacked = groupMetrics.filter(
              (m) => m.slug === "future_investment_balance" || m.slug === "future_retirement_balance"
            );
            return (
              <div key={group} className="flex flex-col gap-2">
                <div className="text-[10px] uppercase tracking-wide text-nw-muted">{group}</div>
                <div className="flex gap-2 items-stretch">
                  {financialIndependence && <div className="flex-1 min-w-0">{renderTile(financialIndependence, true)}</div>}
                  {/* Stacked so the combined height matches Financial Independence's chart
                      tile next to it, per the household's explicit request. */}
                  <div className="flex-1 min-w-0 flex flex-col gap-2">
                    {stacked.map((m) => (
                      <div key={m.slug} className="flex-1 min-h-0">
                        {renderTile(m, true)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          }

          const compact = COMPACT_CHART_GROUPS.has(group);
          const basis = BASIS[rowSize(groupMetrics.length)];
          return (
            <div key={group} className="flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-wide text-nw-muted">{group}</div>
              <div className="flex flex-wrap gap-2 items-start">
                {groupMetrics.map((m) => {
                  const info = targetInfoFor(m, metrics, kpiThresholds ?? {}, history?.series[m.slug]);
                  // No-target metrics (Future Balance projections) show only the name and
                  // number — a narrower, auto-width tile rather than stretching to the
                  // row's shared basis, since there's no bar/chart to fill that width with.
                  return (
                    <div key={m.slug} className={info ? "grow min-w-0 " + basis : "flex-none w-40"}>
                      {renderTile(m, compact)}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <KpiDetailPanel
          metric={selected}
          onClose={() => setSelected(null)}
          onSettingsSaved={() => {
            load();
          }}
        />
      )}
    </div>
  );
}
