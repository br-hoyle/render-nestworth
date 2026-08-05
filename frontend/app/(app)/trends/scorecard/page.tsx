"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { KpiMetric, ScorecardResponse } from "@/lib/types";
import { KpiTile } from "@/components/kpi/KpiTile";
import { KpiDetailPanel } from "@/components/kpi/KpiDetailPanel";

const GROUPS = [
  "Liquidity & Emergency Reserves",
  "Debt & Leverage Management",
  "Cash Flow & Budgeting Efficiency",
  "Wealth Accumulation & Balance Sheet Health",
  "Retirement & Financial Independence",
];

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
  const [selected, setSelected] = useState<KpiMetric | null>(null);

  function load() {
    api.get<ScorecardResponse>("/scorecard").then(setScorecard);
  }

  useEffect(() => {
    load();
  }, []);

  const metrics = scorecard?.metrics ?? [];

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl mx-auto w-full">
      <h1 className="text-lg font-medium">Scorecard</h1>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {GROUPS.map((group) => {
            const groupMetrics = metrics.filter((m) => m.group === group);
            if (groupMetrics.length === 0) return null;
            const basis = BASIS[rowSize(groupMetrics.length)];
            return (
              <div key={group} className="flex flex-col gap-2">
                <div className="text-[10px] uppercase tracking-wide text-nw-muted">{group}</div>
                <div className="flex flex-wrap gap-2">
                  {groupMetrics.map((m) => (
                    <div key={m.slug} className={"grow min-w-0 " + basis}>
                      <KpiTile metric={m} onClick={() => setSelected(m)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {scorecard === null && <p className="text-sm text-nw-muted">Loading…</p>}
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
    </div>
  );
}
