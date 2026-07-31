"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { NumField, ResultTile, fmtMoney } from "./shared";

export interface RetirementInputs {
  current_age: number;
  retirement_age: number;
  life_expectancy: number;
  current_balance: number;
  monthly_contribution: number;
  real_return_rate: number;
  withdrawal_rate: number;
  social_security_monthly: number;
}

interface Result {
  schedule: { age: number; balance: number; phase: string }[];
  balance_at_retirement: string;
  depletion_age: number | null;
  lasts_past_life_expectancy: boolean;
}

const DEFAULT_INPUTS: RetirementInputs = {
  current_age: 40,
  retirement_age: 65,
  life_expectancy: 90,
  current_balance: 0,
  monthly_contribution: 0,
  real_return_rate: 0.05,
  withdrawal_rate: 0.04,
  social_security_monthly: 0,
};

export function RetirementCalculator() {
  const [inputs, setInputs] = useState<RetirementInputs>(DEFAULT_INPUTS);
  const [result, setResult] = useState<Result | null>(null);

  async function resetToMyNumbers() {
    const defaults = await api.get<Partial<RetirementInputs>>("/calculators/retirement/defaults");
    setInputs((i) => ({ ...i, ...defaults, current_balance: Number(defaults.current_balance ?? i.current_balance) }));
  }

  useEffect(() => {
    resetToMyNumbers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      api.post<Result>("/calculators/retirement", inputs).then(setResult).catch(() => setResult(null));
    }, 300);
    return () => clearTimeout(id);
  }, [inputs]);

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="w-full md:w-56 flex-none flex flex-col gap-3">
        <NumField label="Current age" value={inputs.current_age} onChange={(v) => setInputs((i) => ({ ...i, current_age: v }))} />
        <NumField label="Retirement age" value={inputs.retirement_age} onChange={(v) => setInputs((i) => ({ ...i, retirement_age: v }))} />
        <NumField label="Life expectancy" value={inputs.life_expectancy} onChange={(v) => setInputs((i) => ({ ...i, life_expectancy: v }))} />
        <NumField label="Current balance" value={inputs.current_balance} onChange={(v) => setInputs((i) => ({ ...i, current_balance: v }))} />
        <NumField label="Monthly contribution" value={inputs.monthly_contribution} onChange={(v) => setInputs((i) => ({ ...i, monthly_contribution: v }))} />
        <NumField label="Real return rate" value={inputs.real_return_rate} percent onChange={(v) => setInputs((i) => ({ ...i, real_return_rate: v }))} />
        <NumField label="Withdrawal rate" value={inputs.withdrawal_rate} percent onChange={(v) => setInputs((i) => ({ ...i, withdrawal_rate: v }))} />
        <NumField label="Social Security ($/mo)" value={inputs.social_security_monthly} onChange={(v) => setInputs((i) => ({ ...i, social_security_monthly: v }))} />
        <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>
      </div>
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Balance at retirement" value={fmtMoney(result?.balance_at_retirement)} />
          <ResultTile
            label="Funds last until"
            value={result ? (result.depletion_age ? `age ${result.depletion_age}` : `past ${inputs.life_expectancy}`) : "—"}
          />
        </div>
        {result && result.schedule.length > 0 && (
          <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={result.schedule}>
                <CartesianGrid stroke="var(--nw-border)" vertical={false} />
                <XAxis dataKey="age" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
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
