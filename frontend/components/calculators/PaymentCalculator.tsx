"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { NumField, ResultTile, fmtMoney, CalcButton, CalcCopy, CalcTabs, CalcLayout, CalcFieldGrid, CalcEmptyState } from "@/components/calculators/shared";

type Mode = "fixed_term" | "fixed_payments";

const TABS: { key: Mode; label: string }[] = [
  { key: "fixed_term", label: "Fixed Term" },
  { key: "fixed_payments", label: "Fixed Payments" },
];

const MODE_COPY: Record<Mode, string> = {
  fixed_term: "Know your loan amount, rate, and term — find the monthly payment.",
  fixed_payments: "Know your loan amount, rate, and what you can pay each month — find how long it takes to pay off.",
};

export function PaymentCalculator() {
  const [mode, setMode] = useState<Mode>("fixed_term");
  const [inputs, setInputs] = useState({
    principal: 20000,
    annual_rate: 0.07,
    term_years: 5,
    monthly_payment: 400,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  function calculate() {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/payment", { ...inputs, mode })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  function switchMode(next: Mode) {
    setMode(next);
    setResult(null);
  }

  const inputsPanel = (
    <>
      <CalcFieldGrid>
        <NumField label="Loan Amount" prefix="$" value={inputs.principal} onChange={(v) => setInputs((i) => ({ ...i, principal: v }))} />
        <NumField label="Interest Rate" percent value={inputs.annual_rate} onChange={(v) => setInputs((i) => ({ ...i, annual_rate: v }))} />
        {mode === "fixed_term" && (
          <NumField label="Loan Term (Years)" value={inputs.term_years} onChange={(v) => setInputs((i) => ({ ...i, term_years: v }))} />
        )}
        {mode === "fixed_payments" && (
          <NumField
            label="Monthly Payment"
            prefix="$"
            value={inputs.monthly_payment}
            onChange={(v) => setInputs((i) => ({ ...i, monthly_payment: v }))}
          />
        )}
      </CalcFieldGrid>
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
      <div className="flex flex-wrap gap-2">
        {mode === "fixed_term" ? (
          <>
            <ResultTile label="Monthly Payment" value={fmtMoney(result.monthly_payment)} />
            <ResultTile label="Total Paid" value={fmtMoney(result.total_paid)} />
            <ResultTile label="Total Interest" value={fmtMoney(result.total_interest)} />
          </>
        ) : (
          <>
            <ResultTile label="Time to Pay Off" value={`${result.months_to_payoff} mo (${result.years_to_payoff} yr)`} />
            <ResultTile label="Total Paid" value={fmtMoney(result.total_paid)} />
            <ResultTile label="Total Interest" value={fmtMoney(result.total_interest)} />
          </>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy title="Payment Calculator" description={MODE_COPY[mode]} />
      <CalcTabs tabs={TABS} active={mode} onChange={switchMode} />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
