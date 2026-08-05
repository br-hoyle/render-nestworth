"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { NumField, ResultTile, fmtMoney } from "./shared";

interface Inputs {
  principal: number;
  monthly_contribution: number;
  annual_rate: number;
  years: number;
}

interface Result {
  schedule: { year: number; balance: number }[];
  final_balance: string;
  total_contributions: string;
  total_growth: string;
}

export function CompoundGrowthCalculator() {
  const [inputs, setInputs] = useState<Inputs>({ principal: 10000, monthly_contribution: 200, annual_rate: 0.07, years: 20 });
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      api.post<Result>("/calculators/compound-growth", inputs).then(setResult).catch(() => setResult(null));
    }, 300);
    return () => clearTimeout(id);
  }, [inputs]);

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="w-full md:w-56 flex-none flex flex-col gap-3">
        <NumField label="Starting principal" value={inputs.principal} onChange={(v) => setInputs((i) => ({ ...i, principal: v }))} />
        <NumField label="Monthly contribution" value={inputs.monthly_contribution} onChange={(v) => setInputs((i) => ({ ...i, monthly_contribution: v }))} />
        <NumField label="Annual return rate" value={inputs.annual_rate} percent onChange={(v) => setInputs((i) => ({ ...i, annual_rate: v }))} />
        <NumField label="Years" value={inputs.years} onChange={(v) => setInputs((i) => ({ ...i, years: v }))} />
      </div>
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Final balance" value={fmtMoney(result?.final_balance)} />
          <ResultTile label="Total contributions" value={fmtMoney(result?.total_contributions)} />
          <ResultTile label="Total growth" value={fmtMoney(result?.total_growth)} />
        </div>
        {result && result.schedule.length > 0 && (
          <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={result.schedule}>
                <CartesianGrid stroke="var(--nw-border)" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => money(Number(v))} />
                <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
                <Line type="monotone" dataKey="balance" stroke="var(--nw-green)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function money(v: number) {
  return v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
