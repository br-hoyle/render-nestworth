"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { NumField, ResultTile, fmtMoney } from "./shared";

interface Inputs {
  liquid_balance: number;
  monthly_expense: number;
  target_months: number;
}

interface Result {
  months_covered: string | null;
  target_amount: string | null;
  shortfall: string | null;
}

export function EmergencyFundCalculator() {
  const [inputs, setInputs] = useState<Inputs>({ liquid_balance: 0, monthly_expense: 0, target_months: 6 });
  const [result, setResult] = useState<Result | null>(null);

  async function resetToMyNumbers() {
    const defaults = await api.get<Partial<Inputs>>("/calculators/emergency-fund/defaults");
    setInputs((i) => ({
      ...i,
      liquid_balance: Number(defaults.liquid_balance ?? i.liquid_balance),
      monthly_expense: Number(defaults.monthly_expense ?? i.monthly_expense),
    }));
  }

  useEffect(() => {
    resetToMyNumbers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      api.post<Result>("/calculators/emergency-fund", inputs).then(setResult).catch(() => setResult(null));
    }, 300);
    return () => clearTimeout(id);
  }, [inputs]);

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="w-full md:w-56 flex-none flex flex-col gap-3">
        <NumField label="Liquid balance" value={inputs.liquid_balance} onChange={(v) => setInputs((i) => ({ ...i, liquid_balance: v }))} />
        <NumField label="Monthly expense" value={inputs.monthly_expense} onChange={(v) => setInputs((i) => ({ ...i, monthly_expense: v }))} />
        <NumField label="Target months" value={inputs.target_months} onChange={(v) => setInputs((i) => ({ ...i, target_months: v }))} />
        <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>
      </div>
      <div className="flex-1 flex flex-wrap gap-2 content-start">
        <ResultTile label="Months covered" value={result?.months_covered ? `${result.months_covered} mo` : "—"} />
        <ResultTile label="Target amount" value={fmtMoney(result?.target_amount)} />
        <ResultTile label="Shortfall" value={fmtMoney(result?.shortfall)} />
      </div>
    </div>
  );
}
