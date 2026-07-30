"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Scenario, ScenarioComparison, ScenarioType } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { fmtMoney } from "@/components/calculators/shared";

export default function ScenariosPage() {
  const [type, setType] = useState<ScenarioType>("retirement");
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comparison, setComparison] = useState<ScenarioComparison[] | null>(null);

  function load() {
    setComparison(null);
    setSelected(new Set());
    api.get<Scenario[]>(`/scenarios?scenario_type=${type}`).then(setScenarios);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function compare() {
    const params = [...selected].map((id) => `ids=${id}`).join("&");
    const data = await api.get<ScenarioComparison[]>(`/scenarios/compare?${params}`);
    setComparison(data);
  }

  async function remove(id: string) {
    await api.delete(`/scenarios/${id}`);
    load();
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-medium">Scenarios</h1>
        <Link href="/plan/calculators">
          <Button variant="primary">+ New scenario</Button>
        </Link>
      </div>

      <div className="flex gap-2">
        {(["retirement", "house"] as ScenarioType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={
              "px-3 py-1 rounded-full text-xs border capitalize " +
              (type === t ? "border-nw-green-line text-nw-mint bg-nw-green-tint" : "border-nw-border text-nw-muted")
            }
          >
            {t === "house" ? "House affordability" : "Retirement"}
          </button>
        ))}
      </div>

      {scenarios?.length === 0 && <p className="text-sm text-nw-muted">No saved scenarios yet — save one from a calculator.</p>}

      <div className="flex flex-col gap-2">
        {scenarios?.map((s) => (
          <div key={s.scenario_id} className="rounded-lg border border-nw-border bg-nw-surface p-3 flex items-center gap-3">
            <input type="checkbox" checked={selected.has(s.scenario_id)} onChange={() => toggleSelect(s.scenario_id)} />
            <span className="flex-1 text-sm">{s.scenario_name}</span>
            <button onClick={() => remove(s.scenario_id)} className="text-xs text-nw-coral">
              Delete
            </button>
          </div>
        ))}
      </div>

      {selected.size > 0 && (
        <Button variant="primary" className="self-start" onClick={compare}>
          Compare selected ({selected.size})
        </Button>
      )}

      {comparison && comparison.length > 0 && (
        <div className="rounded-lg border border-nw-border bg-nw-surface p-3 overflow-auto">
          <table className="text-sm w-full">
            <thead>
              <tr>
                <th className="text-left text-xs text-nw-muted p-2">Assumption</th>
                {comparison.map((c) => (
                  <th key={c.scenario_id} className="text-left text-xs text-nw-muted p-2">
                    {c.scenario_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {type === "retirement" ? (
                <>
                  <Row label="Retirement age" comparison={comparison} get={(c) => String(c.assumptions.retirement_age)} />
                  <Row label="Monthly contribution" comparison={comparison} get={(c) => fmtMoney(c.assumptions.monthly_contribution)} />
                  <Row label="Real return" comparison={comparison} get={(c) => `${Number(c.assumptions.real_return_rate) * 100}%`} />
                  <Row label="Withdrawal rate" comparison={comparison} get={(c) => `${Number(c.assumptions.withdrawal_rate) * 100}%`} />
                  <Row label="Balance at retirement" comparison={comparison} get={(c) => fmtMoney(c.result.balance_at_retirement)} highlight />
                  <Row
                    label="Lasts until"
                    comparison={comparison}
                    get={(c) => (c.result.depletion_age ? `age ${c.result.depletion_age}` : "past life expectancy")}
                  />
                </>
              ) : (
                <>
                  <Row label="Down payment %" comparison={comparison} get={(c) => `${Number(c.assumptions.down_payment_pct) * 100}%`} />
                  <Row label="Rate / term" comparison={comparison} get={(c) => `${(Number(c.assumptions.annual_rate) * 100).toFixed(2)}% · ${c.assumptions.term_years}y`} />
                  <Row label="Tax/ins/HOA" comparison={comparison} get={(c) => fmtMoney(c.assumptions.tax_ins_hoa_monthly)} />
                  <Row label="Max price" comparison={comparison} get={(c) => fmtMoney(c.result.max_price)} highlight />
                  <Row label="Monthly PITI" comparison={comparison} get={(c) => fmtMoney(c.result.monthly_piti)} />
                  <Row label="Back-end DTI" comparison={comparison} get={(c) => `${c.result.back_end_dti}%`} />
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  comparison,
  get,
  highlight,
}: {
  label: string;
  comparison: ScenarioComparison[];
  get: (c: ScenarioComparison) => string;
  highlight?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-nw-rail" : ""}>
      <td className="p-2 text-xs text-nw-muted">{label}</td>
      {comparison.map((c) => (
        <td key={c.scenario_id} className="p-2">
          {get(c)}
        </td>
      ))}
    </tr>
  );
}
