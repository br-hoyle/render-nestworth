"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { KpiMetric, ScorecardResponse } from "@/lib/types";
import { KpiTile } from "@/components/kpi/KpiTile";
import { KpiDetailPanel } from "@/components/kpi/KpiDetailPanel";
import { BudgetRuleChart } from "@/components/kpi/BudgetRuleChart";

const GROUPS = ["Safety", "Debt & mix", "Efficiency", "Budget rule"];

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
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <h1 className="text-lg font-medium">Scorecard</h1>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {GROUPS.map((group) => (
            <div key={group} className="flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-wide text-nw-muted">{group}</div>
              {group === "Budget rule" ? (
                metrics.length > 0 && <BudgetRuleChart metrics={metrics} />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {metrics
                    .filter((m) => m.group === group)
                    .map((m) => (
                      <div key={m.slug} className="basis-[150px] flex-1 min-w-[130px] max-w-[220px]">
                        <KpiTile metric={m} onClick={() => setSelected(m)} />
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}

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
