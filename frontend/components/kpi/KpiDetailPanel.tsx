"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import type { HouseholdSettings, KpiHistoryResponse, KpiMetric } from "@/lib/types";
import { formatMetricValue, KPI_COLOR_HEX, titleCase } from "@/lib/format";
import { KPI_CONTENT } from "@/lib/kpiContent";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const HIGHER_IS_BETTER = { keys: ["red_below", "green_at_or_above"], labels: ["Red below", "Green at/above"] };
const LOWER_IS_BETTER = { keys: ["green_below", "red_at_or_above"], labels: ["Green below", "Red at/above"] };
const BAND_AROUND_TARGET = {
  keys: ["target", "green_tolerance", "yellow_tolerance"],
  labels: ["Target %", "Green within ±", "Yellow within ±"],
};

// Top-level settings fields (not kpi_thresholds) that back a metric's own formula — edited
// alongside thresholds since both live in the same household_settings PATCH.
const ASSUMPTION_FIELDS: Record<string, { key: string; label: string; step?: string }[]> = {
  fi_progress: [{ key: "fi_withdrawal_rate", label: "Withdrawal rate", step: "0.01" }],
  target_net_worth: [
    { key: "household_age", label: "Current age", step: "1" },
    { key: "target_net_worth_savings_rate", label: "Savings rate", step: "0.01" },
    { key: "target_net_worth_roi", label: "Expected return", step: "0.01" },
  ],
  future_investment_balance: [
    { key: "household_age", label: "Current age", step: "1" },
    { key: "target_retirement_age", label: "Target retirement age", step: "1" },
    { key: "expected_return_rate", label: "Expected return", step: "0.01" },
    { key: "monthly_investment_contribution", label: "Monthly contribution", step: "1" },
  ],
  future_retirement_balance: [
    { key: "household_age", label: "Current age", step: "1" },
    { key: "target_retirement_age", label: "Target retirement age", step: "1" },
    { key: "expected_return_rate", label: "Expected return", step: "0.01" },
    { key: "monthly_retirement_contribution", label: "Monthly contribution", step: "1" },
  ],
};

const THRESHOLD_KEYS: Record<string, { keys: string[]; labels: string[] }> = {
  emergency_fund: HIGHER_IS_BETTER,
  liquidity_ratio: HIGHER_IS_BETTER,
  housing_cost_ratio: LOWER_IS_BETTER,
  savings_rate: HIGHER_IS_BETTER,
  debt_to_income: LOWER_IS_BETTER,
  fi_progress: HIGHER_IS_BETTER,
  target_net_worth: HIGHER_IS_BETTER,
  debt_payoff_runway: LOWER_IS_BETTER,
  debt_to_assets_ratio: LOWER_IS_BETTER,
  liquid_runway: HIGHER_IS_BETTER,
  savings_efficiency: HIGHER_IS_BETTER,
  net_worth_velocity: HIGHER_IS_BETTER,
  needs_ratio: BAND_AROUND_TARGET,
  wants_ratio: BAND_AROUND_TARGET,
  discretionary_spending_rate: LOWER_IS_BETTER,
  net_income_rate: HIGHER_IS_BETTER,
  income_growth_rate: HIGHER_IS_BETTER,
  housing_debt_to_equity: LOWER_IS_BETTER,
};

export function KpiDetailPanel({
  metric,
  onClose,
  onSettingsSaved,
}: {
  metric: KpiMetric;
  onClose: () => void;
  onSettingsSaved: () => void;
}) {
  const [history, setHistory] = useState<KpiHistoryResponse | null>(null);
  const [settings, setSettings] = useState<HouseholdSettings | null>(null);
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [assumptions, setAssumptions] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState(false);

  const assumptionConfig = ASSUMPTION_FIELDS[metric.slug];

  useEffect(() => {
    api.get<KpiHistoryResponse>(`/scorecard/${metric.slug}/history?months=24`).then(setHistory);
    api.get<HouseholdSettings>("/settings").then((s) => {
      setSettings(s);
      setThresholds((s.kpi_thresholds as Record<string, Record<string, number>>)?.[metric.slug] ?? {});
      const fields = ASSUMPTION_FIELDS[metric.slug] ?? [];
      setAssumptions(Object.fromEntries(fields.map((f) => [f.key, (s[f.key] as number | null) ?? null])));
    });
  }, [metric.slug]);

  const thresholdConfig = THRESHOLD_KEYS[metric.slug];

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const kpi_thresholds = { ...(settings.kpi_thresholds as object), [metric.slug]: thresholds };
      await api.patch("/settings", { kpi_thresholds, ...assumptions });
      onSettingsSaved();
    } finally {
      setSaving(false);
    }
  }

  const data = history?.points.map((p) => ({ date: p.date, value: p.value })) ?? [];
  const nonNullCount = data.filter((p) => p.value !== null).length;
  const content = KPI_CONTENT[metric.slug];

  return (
    <div className="w-full md:w-[320px] flex-none rounded-lg border border-nw-border bg-nw-rail p-3 flex flex-col gap-3 overflow-y-auto max-h-[calc(100vh-120px)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{titleCase(metric.label)}</h2>
        <button onClick={onClose} className="text-nw-muted text-xs">
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-medium">{formatMetricValue(metric.value, metric.unit)}</span>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: KPI_COLOR_HEX[metric.color] }} />
      </div>
      {metric.progress_pct !== null && (
        <p className="text-xs text-nw-muted -mt-2">
          Progress to target: <span className="font-medium text-nw-text">{metric.progress_pct.toFixed(1)}%</span>
        </p>
      )}

      {content && (
        <div className="flex flex-col gap-2 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-nw-muted mb-0.5">Description</div>
            <p className="text-nw-text">{content.description}</p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-nw-muted mb-0.5">Formula</div>
            <p className="text-[#B6C6BB] font-mono text-[11px]">{content.formula}</p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-nw-muted mb-0.5">Why It Matters</div>
            <p className="text-nw-text">{content.whyItMatters}</p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-nw-muted mb-0.5">How to Interpret</div>
            <p className="text-nw-text">{content.howToInterpret}</p>
          </div>
        </div>
      )}

      {history === null ? (
        <p className="text-xs text-nw-muted">Loading history…</p>
      ) : nonNullCount > 1 ? (
        <ResponsiveContainer width="100%" height={100}>
          <AreaChart data={data}>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 11 }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--nw-green)"
              fill="var(--nw-green-tint)"
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-xs text-nw-muted">Not enough history yet to chart this metric.</p>
      )}

      {assumptionConfig && (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-wide text-nw-muted">Assumptions</div>
          {assumptionConfig.map((field) => (
            <TextField
              key={field.key}
              label={field.label}
              type="number"
              step={field.step}
              value={assumptions[field.key] ?? ""}
              onChange={(e) => setAssumptions((a) => ({ ...a, [field.key]: e.target.value === "" ? null : Number(e.target.value) }))}
            />
          ))}
        </div>
      )}

      {thresholdConfig && (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-wide text-nw-muted">Thresholds</div>
          {thresholdConfig.keys.map((key, i) => (
            <TextField
              key={key}
              label={thresholdConfig.labels[i]}
              type="number"
              value={thresholds[key] ?? ""}
              onChange={(e) => setThresholds((t) => ({ ...t, [key]: Number(e.target.value) }))}
            />
          ))}
        </div>
      )}

      {(thresholdConfig || assumptionConfig) && (
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      )}
    </div>
  );
}
