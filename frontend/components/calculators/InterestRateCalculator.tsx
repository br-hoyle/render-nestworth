"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { NumField, ResultTile, fmtMoney, CalcButton, CalcCopy, CalcLayout, CalcRow, CalcCol, CalcAnswer, CalcEmptyState } from "@/components/calculators/shared";

export function InterestRateCalculator() {
  const [inputs, setInputs] = useState({
    principal: 200000,
    term_years: 30,
    term_months: 0,
    target_monthly_payment: 1500,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  function calculate() {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/interest-rate", inputs)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol><NumField label="Loan Amount" prefix="$" value={inputs.principal} onChange={(v) => setInputs((i) => ({ ...i, principal: v }))} /></CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol><NumField label="Term (Years)" value={inputs.term_years} onChange={(v) => setInputs((i) => ({ ...i, term_years: v }))} /></CalcCol>
        <CalcCol><NumField label="Term (Extra Months)" value={inputs.term_months} onChange={(v) => setInputs((i) => ({ ...i, term_months: v }))} /></CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField
            label="Monthly Payment"
            prefix="$"
            value={inputs.target_monthly_payment}
            onChange={(v) => setInputs((i) => ({ ...i, target_monthly_payment: v }))}
          />
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
      <div className="flex flex-col gap-3">
        <CalcAnswer>
          At {fmtMoney(inputs.target_monthly_payment)}/mo on a {fmtMoney(inputs.principal)} loan over {inputs.term_years} years
          {inputs.term_months ? ` ${inputs.term_months} months` : ""}, the implied interest rate is {String(result.annual_rate_pct)}%.
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Implied Annual Rate" value={`${result.annual_rate_pct}%`} />
          <ResultTile label="Total Paid" value={fmtMoney(result.total_paid)} />
          <ResultTile label="Total Interest" value={fmtMoney(result.total_interest)} />
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="Interest Rate Calculator"
        description="Back into the real interest rate on a loan when you only know the amount, term, and monthly payment — useful when a dealer or lender only quotes the payment, not the rate."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
