"use client";

import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { NumField, ResultTile, fmtMoney } from "@/components/calculators/shared";
import { Button } from "@/components/ui/Button";

export interface FieldConfig {
  key: string;
  label: string;
  step?: string;
  default: number;
  percent?: boolean;
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

export interface CalculatorConfig {
  slug: string;
  fields: FieldConfig[];
  debtList?: DebtListConfig;
  results: ResultConfig[];
  scheduleKey?: string;
  scheduleXKey?: string;
  scheduleYKey?: string;
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
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(config.fields.map((f) => [f.key, f.default]))
  );
  const [debtRows, setDebtRows] = useState<Record<string, number>[]>(
    config.debtList
      ? [Object.fromEntries(config.debtList.rowFields.map((f) => [f.key, f.default]))]
      : []
  );
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!config.hasDefaults) return;
    api.get<Record<string, number>>(`/calculators/${config.slug}/defaults`).then((defaults) => {
      if (Object.keys(defaults).length > 0) {
        setValues((v) => ({ ...v, ...defaults }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.slug]);

  useEffect(() => {
    const id = setTimeout(() => {
      const payload = config.debtList ? { ...values, [config.debtList.key]: debtRows } : values;
      api
        .post<Record<string, unknown>>(`/calculators/${config.slug}`, payload)
        .then(setResult)
        .catch(() => setResult(null));
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, debtRows, config.slug]);

  function updateDebtRow(index: number, key: string, value: number) {
    setDebtRows((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  }

  const scheduleData =
    config.scheduleKey && result
      ? ((result[config.scheduleKey] as Record<string, unknown>[]) ?? [])
      : [];

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="w-full md:w-56 flex-none flex flex-col gap-2">
        {config.fields.map((f) => (
          <NumField
            key={f.key}
            label={f.label}
            step={f.step}
            percent={f.percent}
            value={values[f.key]}
            onChange={(v) => setValues((vals) => ({ ...vals, [f.key]: v }))}
          />
        ))}

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
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {config.results.map((r) => (
            <ResultTile key={r.key} label={r.label} value={formatResult(result?.[r.key], r.format)} />
          ))}
        </div>
        {result?.error != null && typeof result.error === "string" && (
          <p className="text-xs text-nw-coral">{result.error}</p>
        )}
        {scheduleData.length > 1 && config.scheduleXKey && config.scheduleYKey && (
          <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={scheduleData}>
                <XAxis dataKey={config.scheduleXKey} tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={60} tickFormatter={(v) => money(v)} />
                <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
                <Line type="monotone" dataKey={config.scheduleYKey} stroke="var(--nw-green)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {config.note && <p className="text-[10px] text-nw-muted">{config.note}</p>}
      </div>
    </div>
  );
}
