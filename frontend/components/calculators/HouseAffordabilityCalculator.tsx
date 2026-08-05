"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { NumField, ResultTile, fmtMoney } from "./shared";

export interface HouseInputs {
  gross_monthly_income: number;
  monthly_debts: number;
  down_payment_pct: number;
  annual_rate: number;
  term_years: number;
  tax_ins_hoa_monthly: number;
}

interface Result {
  max_price: string;
  monthly_piti: string;
  front_end_dti: string | null;
  back_end_dti: string | null;
}

const DEFAULT_INPUTS: HouseInputs = {
  gross_monthly_income: 0,
  monthly_debts: 0,
  down_payment_pct: 0.2,
  annual_rate: 0.065,
  term_years: 30,
  tax_ins_hoa_monthly: 400,
};

export function HouseAffordabilityCalculator() {
  const [inputs, setInputs] = useState<HouseInputs>(DEFAULT_INPUTS);
  const [result, setResult] = useState<Result | null>(null);

  async function resetToMyNumbers() {
    const defaults = await api.get<Partial<HouseInputs>>("/calculators/house-affordability/defaults");
    setInputs((i) => ({
      ...i,
      ...defaults,
      gross_monthly_income: Number(defaults.gross_monthly_income ?? i.gross_monthly_income),
    }));
  }

  useEffect(() => {
    resetToMyNumbers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!inputs.gross_monthly_income) return;
    const id = setTimeout(() => {
      api
        .post<Result>("/calculators/house-affordability", inputs)
        .then(setResult)
        .catch(() => setResult(null));
    }, 300);
    return () => clearTimeout(id);
  }, [inputs]);

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="w-full md:w-56 flex-none flex flex-col gap-3">
        <NumField label="Gross monthly income" value={inputs.gross_monthly_income} onChange={(v) => setInputs((i) => ({ ...i, gross_monthly_income: v }))} />
        <NumField label="Other monthly debts" value={inputs.monthly_debts} onChange={(v) => setInputs((i) => ({ ...i, monthly_debts: v }))} />
        <NumField label="Down payment" value={inputs.down_payment_pct} percent onChange={(v) => setInputs((i) => ({ ...i, down_payment_pct: v }))} />
        <NumField label="Rate" value={inputs.annual_rate} percent onChange={(v) => setInputs((i) => ({ ...i, annual_rate: v }))} />
        <NumField label="Term (years)" value={inputs.term_years} onChange={(v) => setInputs((i) => ({ ...i, term_years: v }))} />
        <NumField label="Tax/ins/HOA per month" value={inputs.tax_ins_hoa_monthly} onChange={(v) => setInputs((i) => ({ ...i, tax_ins_hoa_monthly: v }))} />
        <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>
      </div>
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Max price" value={fmtMoney(result?.max_price)} />
          <ResultTile label="Monthly PITI" value={fmtMoney(result?.monthly_piti)} />
          <ResultTile label="Front-end DTI" value={result?.front_end_dti ? `${result.front_end_dti}%` : "—"} />
          <ResultTile label="Back-end DTI" value={result?.back_end_dti ? `${result.back_end_dti}%` : "—"} />
        </div>
      </div>
    </div>
  );
}
