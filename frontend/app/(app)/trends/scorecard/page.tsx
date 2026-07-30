"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { KpiMetric, ScorecardResponse } from "@/lib/types";
import { KpiTile } from "@/components/kpi/KpiTile";
import { KpiDetailPanel } from "@/components/kpi/KpiDetailPanel";
import { AllocationDonut } from "@/components/charts/AllocationDonut";

const GROUPS = ["Safety", "Growth", "Debt & mix"];

export default function ScorecardPage() {
  const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);
  const [selected, setSelected] = useState<KpiMetric | null>(null);

  function load() {
    api.get<ScorecardResponse>("/scorecard").then(setScorecard);
  }

  useEffect(() => {
    load();
  }, []);

  const metrics = scorecard?.metrics.filter((m) => m.unit !== "mix") ?? [];
  const mixMetric = scorecard?.metrics.find((m) => m.unit === "mix");

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <h1 className="text-lg font-medium">Scorecard</h1>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {GROUPS.map((group) => (
            <div key={group} className="flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-wide text-nw-muted">{group}</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {metrics
                  .filter((m) => m.group === group)
                  .map((m) => (
                    <KpiTile key={m.slug} metric={m} onClick={() => setSelected(m)} />
                  ))}
              </div>
            </div>
          ))}

          {mixMetric?.mix && (
            <div className="rounded-lg border border-nw-border bg-nw-surface p-3 max-w-sm">
              <div className="text-sm font-medium mb-2">Allocation mix</div>
              <AllocationDonut mix={mixMetric.mix} />
            </div>
          )}

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
