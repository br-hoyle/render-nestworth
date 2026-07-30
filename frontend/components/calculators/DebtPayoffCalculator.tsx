"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { NumField, ResultTile, fmtMoney } from "./shared";

interface Inputs {
  balance: number;
  annual_rate: number;
  monthly_payment: number;
}

interface Result {
  payoff_months: number | null;
  total_interest: string | null;
  schedule: { month: number; balance: string }[];
  error: string | null;
}

export function DebtPayoffCalculator() {
  const [inputs, setInputs] = useState<Inputs>({ balance: 0, annual_rate: 0.18, monthly_payment: 0 });
  const [result, setResult] = useState<Result | null>(null);

  async function resetToMyNumbers() {
    const defaults = await api.get<Partial<Inputs>>("/calculators/debt-payoff/defaults");
    setInputs((i) => ({ ...i, ...defaults, balance: Number(defaults.balance ?? i.balance) }));
  }

  useEffect(() => {
    resetToMyNumbers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!inputs.balance || !inputs.monthly_payment) return;
    const id = setTimeout(() => {
      api.post<Result>("/calculators/debt-payoff", inputs).then(setResult).catch(() => setResult(null));
    }, 300);
    return () => clearTimeout(id);
  }, [inputs]);

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="w-full md:w-56 flex-none flex flex-col gap-3">
        <NumField label="Current balance" value={inputs.balance} onChange={(v) => setInputs((i) => ({ ...i, balance: v }))} />
        <NumField label="APR" value={inputs.annual_rate} step="0.001" onChange={(v) => setInputs((i) => ({ ...i, annual_rate: v }))} />
        <NumField label="Monthly payment" value={inputs.monthly_payment} onChange={(v) => setInputs((i) => ({ ...i, monthly_payment: v }))} />
        <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>
      </div>
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {result?.error ? (
          <p className="text-sm text-nw-coral">{result.error}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <ResultTile label="Payoff" value={result?.payoff_months ? `${result.payoff_months} mo` : "—"} />
              <ResultTile label="Total interest" value={fmtMoney(result?.total_interest)} />
            </div>
            {result && result.schedule.length > 0 && (
              <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-1 max-h-64 overflow-auto">
                {result.schedule.map((s) => (
                  <div key={s.month} className="flex justify-between text-xs">
                    <span className="text-nw-muted">Month {s.month}</span>
                    <span>{fmtMoney(s.balance)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
