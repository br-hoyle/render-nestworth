"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { NumField, ResultTile, fmtMoney } from "./shared";

interface Inputs {
  principal: number;
  annual_rate: number;
  term_years: number;
  start_date: string;
  extra_monthly: number;
}

interface Result {
  monthly_payment: string;
  payoff_date: string;
  total_interest: string;
  interest_saved: string;
  months_saved: number;
  yearly_schedule: { year: number; balance: string }[];
}

export function MortgageCalculator() {
  const [inputs, setInputs] = useState<Inputs>({
    principal: 0,
    annual_rate: 0.065,
    term_years: 30,
    start_date: new Date().toISOString().slice(0, 10),
    extra_monthly: 0,
  });
  const [result, setResult] = useState<Result | null>(null);

  async function resetToMyNumbers() {
    const defaults = await api.get<Partial<Inputs>>("/calculators/mortgage/defaults");
    setInputs((i) => ({ ...i, ...defaults, principal: Number(defaults.principal ?? i.principal) }));
  }

  useEffect(() => {
    resetToMyNumbers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!inputs.principal) return;
    const id = setTimeout(() => {
      api.post<Result>("/calculators/mortgage", inputs).then(setResult).catch(() => setResult(null));
    }, 300);
    return () => clearTimeout(id);
  }, [inputs]);

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="w-full md:w-56 flex-none flex flex-col gap-3">
        <NumField label="Principal" value={inputs.principal} onChange={(v) => setInputs((i) => ({ ...i, principal: v }))} />
        <NumField label="Rate" value={inputs.annual_rate} percent onChange={(v) => setInputs((i) => ({ ...i, annual_rate: v }))} />
        <NumField label="Term (years)" value={inputs.term_years} onChange={(v) => setInputs((i) => ({ ...i, term_years: v }))} />
        <TextField
          label="Start date"
          type="date"
          value={inputs.start_date}
          onChange={(e) => setInputs((i) => ({ ...i, start_date: e.target.value }))}
        />
        <NumField
          label="Extra monthly payment"
          value={inputs.extra_monthly}
          onChange={(v) => setInputs((i) => ({ ...i, extra_monthly: v }))}
        />
        <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>
      </div>
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Monthly P&I" value={fmtMoney(result?.monthly_payment)} />
          <ResultTile label="Payoff date" value={result?.payoff_date ?? "—"} />
          <ResultTile label="Total interest" value={fmtMoney(result?.total_interest)} />
          <ResultTile label="Interest saved" value={fmtMoney(result?.interest_saved)} />
        </div>
        {result && result.yearly_schedule.length > 0 && (
          <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={result.yearly_schedule.map((s) => ({ year: s.year, balance: Number(s.balance) }))}>
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
