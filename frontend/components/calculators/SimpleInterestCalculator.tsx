"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { NumField, ResultTile, fmtMoney, CalcButton, CalcCopy, CalcLayout, CalcRow, CalcCol, CalcAnswer, CalcEmptyState } from "@/components/calculators/shared";

export function SimpleInterestCalculator() {
  const [inputs, setInputs] = useState({
    principal: 10000,
    annual_rate: 0.05,
    years: 1,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  function calculate() {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/simple-interest", inputs)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol>
          <NumField label="Principal" prefix="$" value={inputs.principal} onChange={(v) => setInputs((i) => ({ ...i, principal: v }))} />
        </CalcCol>
        <CalcCol>
          <NumField label="Interest Rate" percent value={inputs.annual_rate} onChange={(v) => setInputs((i) => ({ ...i, annual_rate: v }))} />
        </CalcCol>
        <CalcCol>
          <NumField label="Term (Years)" value={inputs.years} onChange={(v) => setInputs((i) => ({ ...i, years: v }))} />
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
          At {inputs.years} year{inputs.years === 1 ? "" : "s"}, this earns {fmtMoney(result.interest)} in interest — a total of{" "}
          {fmtMoney(result.total)}.
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Interest Earned" value={fmtMoney(result.interest)} />
          <ResultTile label="Total (Principal + Interest)" value={fmtMoney(result.total)} />
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="Simple Interest Calculator"
        description="Interest that accrues on the principal only, with no compounding — Interest = Principal × Rate × Time. Useful for short-term loans and some bonds/CDs where interest doesn't compound."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
