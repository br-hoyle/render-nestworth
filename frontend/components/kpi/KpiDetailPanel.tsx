"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import type { HouseholdSettings, KpiHistoryResponse, KpiMetric } from "@/lib/types";
import { formatMetricValue, KPI_COLOR_HEX } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const THRESHOLD_KEYS: Record<string, { keys: string[]; labels: string[] }> = {
  emergency_fund: { keys: ["red_below", "green_at_or_above"], labels: ["Red below", "Green at/above"] },
  liquidity_ratio: { keys: ["red_below", "green_at_or_above"], labels: ["Red below", "Green at/above"] },
  housing_cost_ratio: { keys: ["green_below", "red_at_or_above"], labels: ["Green below", "Red at/above"] },
  savings_rate: { keys: ["red_below", "green_at_or_above"], labels: ["Red below", "Green at/above"] },
  retirement_contribution_rate: { keys: ["red_below", "green_at_or_above"], labels: ["Red below", "Green at/above"] },
  debt_to_income: { keys: ["green_below", "red_at_or_above"], labels: ["Green below", "Red at/above"] },
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<KpiHistoryResponse>(`/scorecard/${metric.slug}/history?months=24`).then(setHistory);
    api.get<HouseholdSettings>("/settings").then((s) => {
      setSettings(s);
      setThresholds((s.kpi_thresholds as Record<string, Record<string, number>>)?.[metric.slug] ?? {});
    });
  }, [metric.slug]);

  const thresholdConfig = THRESHOLD_KEYS[metric.slug];

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const kpi_thresholds = { ...(settings.kpi_thresholds as object), [metric.slug]: thresholds };
      await api.patch("/settings", { kpi_thresholds });
      onSettingsSaved();
    } finally {
      setSaving(false);
    }
  }

  const data = history?.points.map((p) => ({ date: p.date, value: p.value })) ?? [];

  return (
    <div className="w-full md:w-[320px] flex-none rounded-lg border border-nw-border bg-nw-rail p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{metric.label}</h2>
        <button onClick={onClose} className="text-nw-muted text-xs">
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-medium">{formatMetricValue(metric.value, metric.unit)}</span>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: KPI_COLOR_HEX[metric.color] }} />
      </div>

      {data.length > 1 && (
        <ResponsiveContainer width="100%" height={100}>
          <AreaChart data={data}>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 11 }} />
            <Area type="monotone" dataKey="value" stroke="var(--nw-green)" fill="var(--nw-green-tint)" />
          </AreaChart>
        </ResponsiveContainer>
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
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
