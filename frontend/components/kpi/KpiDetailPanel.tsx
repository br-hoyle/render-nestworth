"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { HouseholdSettings, KpiMetric } from "@/lib/types";
import { formatMetricValue, KPI_COLOR_HEX, titleCase } from "@/lib/format";
import { KPI_CONTENT } from "@/lib/kpiContent";
import { THRESHOLD_CONFIG } from "@/lib/kpiThresholds";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { LoadingBlock } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";

// Top-level settings fields (not kpi_thresholds) that back a metric's own formula — edited
// alongside thresholds since both live in the same household_settings PATCH. Age is
// deliberately NOT one of these: it's derived from the birthdate set on the Settings page
// (falling back to a manually-entered household_age only if no birthdate is on file), so
// editing it here would either be redundant or silently get overridden.
const ASSUMPTION_FIELDS: Record<string, { key: string; label: string; step?: string }[]> = {
  fi_progress: [{ key: "fi_withdrawal_rate", label: "Withdrawal rate", step: "0.01" }],
  target_net_worth: [
    { key: "target_net_worth_savings_rate", label: "Savings rate", step: "0.01" },
    { key: "target_net_worth_roi", label: "Expected return", step: "0.01" },
  ],
  future_investment_balance: [
    { key: "target_retirement_age", label: "Target retirement age", step: "1" },
    { key: "expected_return_rate", label: "Expected return", step: "0.01" },
    { key: "monthly_investment_contribution", label: "Monthly contribution", step: "1" },
  ],
  future_retirement_balance: [
    { key: "target_retirement_age", label: "Target retirement age", step: "1" },
    { key: "expected_return_rate", label: "Expected return", step: "0.01" },
    { key: "monthly_retirement_contribution", label: "Monthly contribution", step: "1" },
  ],
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
  const [settings, setSettings] = useState<HouseholdSettings | null>(null);
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [assumptions, setAssumptions] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState(false);

  const assumptionConfig = ASSUMPTION_FIELDS[metric.slug];

  useEffect(() => {
    api.get<HouseholdSettings>("/settings").then((s) => {
      setSettings(s);
      setThresholds((s.kpi_thresholds as Record<string, Record<string, number>>)?.[metric.slug] ?? {});
      const fields = ASSUMPTION_FIELDS[metric.slug] ?? [];
      setAssumptions(Object.fromEntries(fields.map((f) => [f.key, (s[f.key] as number | null) ?? null])));
    });
  }, [metric.slug]);

  const thresholdConfig = THRESHOLD_CONFIG[metric.slug];

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

  const content = KPI_CONTENT[metric.slug];

  return (
    <Modal
      onClose={onClose}
      className="w-full max-w-sm rounded-lg border border-nw-border bg-nw-rail p-3 flex flex-col gap-3 max-h-[85vh] overflow-y-auto"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">{titleCase(metric.label)}</h2>
          <button type="button" onClick={onClose} className="text-nw-muted text-xs">
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
              {metric.inputs.length > 0 && (
                <table className="w-full mt-1.5 text-[11px]">
                  <tbody>
                    {metric.inputs.map((row) => (
                      <tr key={row.label} className="border-t border-nw-border first:border-t-0">
                        <td className="py-1 pr-2 text-nw-muted">{row.label}</td>
                        <td className="py-1 text-right font-mono text-nw-text whitespace-nowrap">
                          {formatMetricValue(row.value, row.unit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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

        {(thresholdConfig || assumptionConfig) && settings === null && (
          <LoadingBlock className="py-4" />
        )}

        {assumptionConfig && settings !== null && (
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

        {thresholdConfig && settings !== null && (
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

        {(thresholdConfig || assumptionConfig) && settings !== null && (
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </form>
    </Modal>
  );
}
