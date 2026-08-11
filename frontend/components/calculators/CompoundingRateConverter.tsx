"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { NumField, CalcButton, CalcCopy, CalcLayout, CalcRow, CalcCol, ScheduleTable, CalcEmptyState } from "@/components/calculators/shared";
import { titleCase } from "@/lib/format";
import type { ExtendedCompoundFrequency } from "@/lib/calculatorTypes";

const FREQUENCY_OPTIONS: { value: ExtendedCompoundFrequency; label: string }[] = [
  { value: "annually", label: "Annually" },
  { value: "semiannually", label: "Semiannually" },
  { value: "quarterly", label: "Quarterly" },
  { value: "monthly", label: "Monthly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily" },
  { value: "continuous", label: "Continuous" },
];

interface ComparisonRow {
  frequency: string;
  nominal_rate_pct: number;
}

export function CompoundingRateConverter() {
  const [inputs, setInputs] = useState({
    input_rate: 0.1,
    input_compound_frequency: "monthly" as ExtendedCompoundFrequency,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  function calculate() {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/compound-interest", inputs)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  const table = ((result?.comparison_table as ComparisonRow[]) ?? []).map((row) => ({
    ...row,
    frequency: titleCase(row.frequency),
  }));

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol><NumField label="Rate" percent value={inputs.input_rate} onChange={(v) => setInputs((i) => ({ ...i, input_rate: v }))} /></CalcCol>
        <CalcCol>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-nw-muted">Compounded As</span>
            <select
              value={inputs.input_compound_frequency}
              onChange={(e) => setInputs((i) => ({ ...i, input_compound_frequency: e.target.value as ExtendedCompoundFrequency }))}
              className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm text-nw-text"
            >
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </CalcCol>
      </CalcRow>
      <div className="pt-1">
        <CalcButton onClick={calculate} loading={loading} />
      </div>
    </>
  );

  const resultsPanel =
    result === null ? (
      <CalcEmptyState />
    ) : result.error ? (
      <p className="text-xs text-nw-coral">{String(result.error)}</p>
    ) : (
      <ScheduleTable rows={table} columns={[{ key: "frequency", label: "Compounding" }, { key: "nominal_rate_pct", label: "Equivalent Nominal Rate", format: "percent" }]} />
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="Compounding Rate Converter"
        description="A rate quoted at one compounding frequency isn't the same number at another — enter a rate and how it compounds, and see the equivalent rate at every other frequency side by side."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
