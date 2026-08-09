"use client";

import { useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import {
  NumField,
  ResultTile,
  fmtMoney,
  CalcButton,
  CalcCopy,
  CalcLayout,
  CalcFieldGrid,
  CalcEmptyState,
} from "@/components/calculators/shared";
import { StackedGrowthChart } from "@/components/calculators/StackedGrowthChart";
import { Button } from "@/components/ui/Button";

export interface FieldConfig {
  key: string;
  label: string;
  step?: string;
  default: number | string;
  percent?: boolean;
  prefix?: string;
  chips?: number[];
  helper?: string;
  /** Spans both columns of the field grid instead of sharing a row — for selects and fields
   * with long helper text that don't fit comfortably at half width. */
  fullWidth?: boolean;
  /** Renders this field as a <select> of string values instead of a numeric NumField —
   * for enum-like inputs (compounding frequency, contribution timing, etc). */
  options?: { value: string; label: string }[];
}

export interface DebtListConfig {
  key: string; // e.g. "debts"
  rowFields: { key: string; label: string; default: number; percent?: boolean }[];
}

export interface ResultConfig {
  key: string;
  label: string;
  format?: "money" | "percent" | "number" | "months" | "text";
}

export interface TableConfig {
  key: string; // top-level result key holding an array of row objects
  columns: { key: string; label: string; format?: ResultConfig["format"] }[];
}

export interface CalculatorConfig {
  slug: string;
  copy: { title: string; description: string };
  fields: FieldConfig[];
  debtList?: DebtListConfig;
  results: ResultConfig[];
  scheduleKey?: string;
  scheduleXKey?: string;
  scheduleYKey?: string;
  /** Renders the schedule as a stacked starting-balance/contributions/growth area chart
   * instead of a single balance line — the schedule points must include starting_balance and
   * contributions_to_date alongside scheduleYKey (see StackedGrowthChart). */
  stackedSchedule?: boolean;
  table?: TableConfig;
  hasDefaults?: boolean;
  note?: string;
}

function formatResult(value: unknown, format?: ResultConfig["format"]): string {
  if (value === null || value === undefined) return "—";
  if (format === "money") return fmtMoney(value);
  if (format === "percent") return `${Number(value).toFixed(2)}%`;
  if (format === "months") return `${value} mo`;
  if (format === "text" && typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function GenericCalculator({ config }: { config: CalculatorConfig }) {
  const [values, setValues] = useState<Record<string, number | string>>(
    Object.fromEntries(config.fields.map((f) => [f.key, f.default]))
  );
  const [debtRows, setDebtRows] = useState<Record<string, number>[]>(
    config.debtList
      ? [Object.fromEntries(config.debtList.rowFields.map((f) => [f.key, f.default]))]
      : []
  );
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  function calculate(overrideValues?: Record<string, number | string>, overrideDebtRows?: Record<string, number>[]) {
    setLoading(true);
    const base = overrideValues ?? values;
    const rows = overrideDebtRows ?? debtRows;
    const payload = config.debtList ? { ...base, [config.debtList.key]: rows } : base;
    api
      .post<Record<string, unknown>>(`/calculators/${config.slug}`, payload)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  function resetToMyNumbers() {
    api.get<Record<string, unknown>>(`/calculators/${config.slug}/defaults`).then((defaults) => {
      if (Object.keys(defaults).length === 0) return;
      // The debtList's own key (e.g. "debts") holds an array of prefill rows, not a scalar
      // value — split it out so it can populate debtRows instead of being merged into values.
      const { [config.debtList?.key ?? ""]: defaultDebts, ...scalarDefaults } = defaults;
      const merged = { ...values, ...(scalarDefaults as Record<string, number | string>) };
      setValues(merged);

      if (config.debtList && Array.isArray(defaultDebts) && defaultDebts.length > 0) {
        const rows = (defaultDebts as Record<string, unknown>[]).map((d) =>
          Object.fromEntries(config.debtList!.rowFields.map((f) => [f.key, Number(d[f.key] ?? f.default)]))
        );
        setDebtRows(rows);
        calculate(merged, rows);
      } else {
        calculate(merged);
      }
    });
  }

  function updateDebtRow(index: number, key: string, value: number) {
    setDebtRows((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  }

  const scheduleData =
    config.scheduleKey && result
      ? ((result[config.scheduleKey] as Record<string, unknown>[]) ?? [])
      : [];
  const stackedData = config.stackedSchedule
    ? scheduleData.map((row) => ({
        label: row[config.scheduleXKey!] as number | string,
        starting: Number(row.starting_balance ?? 0),
        contributions: Number(row.contributions_to_date ?? 0),
        growth: Math.max(
          0,
          Number(row[config.scheduleYKey!] ?? 0) - Number(row.starting_balance ?? 0) - Number(row.contributions_to_date ?? 0)
        ),
      }))
    : [];

  const inputs = (
    <>
      <CalcFieldGrid>
        {config.fields.map((f) => (
          <div key={f.key} className={f.fullWidth ? "sm:col-span-2 xl:col-span-3" : undefined}>
            {f.options ? (
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide text-nw-muted">{f.label}</span>
                <select
                  value={String(values[f.key])}
                  onChange={(e) => setValues((vals) => ({ ...vals, [f.key]: e.target.value }))}
                  className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm text-nw-text"
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <NumField
                label={f.label}
                step={f.step}
                percent={f.percent}
                prefix={f.prefix}
                chips={f.chips}
                helper={f.helper}
                value={Number(values[f.key])}
                onChange={(v) => setValues((vals) => ({ ...vals, [f.key]: v }))}
              />
            )}
          </div>
        ))}
      </CalcFieldGrid>

      {config.debtList && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] uppercase tracking-wide text-nw-muted">Debts</div>
          {debtRows.map((row, i) => (
            <div key={i} className="rounded-md border border-nw-border p-2 flex flex-col gap-1.5">
              {config.debtList!.rowFields.map((rf) => (
                <NumField
                  key={rf.key}
                  label={rf.label}
                  percent={rf.percent}
                  value={row[rf.key]}
                  onChange={(v) => updateDebtRow(i, rf.key, v)}
                />
              ))}
              {debtRows.length > 1 && (
                <button
                  onClick={() => setDebtRows((rows) => rows.filter((_, idx) => idx !== i))}
                  className="text-[10px] text-nw-coral self-start"
                >
                  Remove debt
                </button>
              )}
            </div>
          ))}
          <Button
            onClick={() =>
              setDebtRows((rows) => [
                ...rows,
                Object.fromEntries(config.debtList!.rowFields.map((f) => [f.key, f.default])),
              ])
            }
          >
            + Add debt
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <CalcButton onClick={() => calculate()} loading={loading} />
        {config.hasDefaults && <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>}
      </div>
      {config.note && <p className="text-[10px] text-nw-muted">{config.note}</p>}
    </>
  );

  const results =
    result === null ? (
      <CalcEmptyState />
    ) : (
      <div className="flex flex-col gap-3">
        {config.results.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {config.results.map((r) => (
              <ResultTile key={r.key} label={r.label} value={formatResult(result?.[r.key], r.format)} />
            ))}
          </div>
        )}
        {result?.error != null && typeof result.error === "string" && (
          <p className="text-xs text-nw-coral">{result.error}</p>
        )}
        {config.scheduleXKey && config.scheduleYKey && (
          scheduleData.length > 1 ? (
            config.stackedSchedule ? (
              <StackedGrowthChart data={stackedData} xLabel={config.scheduleXKey} />
            ) : (
              <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={scheduleData}>
                    <XAxis dataKey={config.scheduleXKey} tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={60} tickFormatter={(v) => money(v)} />
                    <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
                    <Line type="monotone" dataKey={config.scheduleYKey} stroke="var(--nw-green)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )
          ) : (
            <p className="text-xs text-nw-muted">Not enough data yet.</p>
          )
        )}
        {config.table && Array.isArray(result?.[config.table.key]) && (
          <div className="rounded-lg border border-nw-border bg-nw-surface overflow-x-auto">
            <table className="text-xs w-full min-w-max border-collapse">
              <thead>
                <tr className="text-nw-muted text-left">
                  {config.table.columns.map((c) => (
                    <th key={c.key} className="px-3 py-2 font-normal whitespace-nowrap">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(result![config.table.key] as Record<string, unknown>[]).map((row, i) => (
                  <tr key={i} className="border-t border-nw-border">
                    {config.table!.columns.map((c) => (
                      <td key={c.key} className="px-3 py-1.5 whitespace-nowrap">{formatResult(row[c.key], c.format)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy title={config.copy.title} description={config.copy.description} />
      <CalcLayout inputs={inputs} results={results} />
    </div>
  );
}
