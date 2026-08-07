"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import {
  NumField,
  ResultTile,
  fmtMoney,
  CalcButton,
  CalcCopy,
  CalcTabs,
  CalcLayout,
  CalcRow,
  CalcCol,
  CalcAnswer,
  CalcEmptyState,
  SelectField,
} from "@/components/calculators/shared";
import { FREQUENCY_OPTIONS, type CompoundFrequency } from "@/lib/calculatorTypes";

type Mode = "fixed_time" | "fixed_installment";

const TABS: { key: Mode; label: string }[] = [
  { key: "fixed_time", label: "Fixed Time" },
  { key: "fixed_installment", label: "Fixed Installment" },
];

const MODE_COPY: Record<Mode, string> = {
  fixed_time: "Repay an existing balance within a chosen number of years — find the payment each period.",
  fixed_installment: "Repay an existing balance with a fixed payment each period — find how long it takes.",
};

export function RepaymentCalculator() {
  const [mode, setMode] = useState<Mode>("fixed_time");
  const [inputs, setInputs] = useState({
    balance: 15000,
    annual_rate: 0.08,
    compound_frequency: "monthly" as CompoundFrequency,
    payback_frequency: "monthly" as CompoundFrequency,
    term_years: 3,
    installment_amount: 500,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  function calculate() {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/repayment", { ...inputs, mode })
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
      <CalcRow>
        <CalcCol>
          <NumField label="Loan Amount" prefix="$" value={inputs.balance} onChange={(v) => setInputs((i) => ({ ...i, balance: v }))} />
        </CalcCol>
        <CalcCol>
          {mode === "fixed_time" ? (
            <NumField label="Term (Years)" value={inputs.term_years} onChange={(v) => setInputs((i) => ({ ...i, term_years: v }))} />
          ) : (
            <NumField
              label="Minimum Payment"
              prefix="$"
              value={inputs.installment_amount}
              onChange={(v) => setInputs((i) => ({ ...i, installment_amount: v }))}
            />
          )}
        </CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField label="Interest Rate" percent value={inputs.annual_rate} onChange={(v) => setInputs((i) => ({ ...i, annual_rate: v }))} />
        </CalcCol>
        <CalcCol>
          <SelectField
            label="Compound Frequency"
            value={inputs.compound_frequency}
            onChange={(v) => setInputs((i) => ({ ...i, compound_frequency: v }))}
            options={FREQUENCY_OPTIONS}
          />
        </CalcCol>
        <CalcCol>
          <SelectField
            label="Payback Frequency"
            value={inputs.payback_frequency}
            onChange={(v) => setInputs((i) => ({ ...i, payback_frequency: v }))}
            options={FREQUENCY_OPTIONS}
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
          {mode === "fixed_time"
            ? `Paying this off over ${inputs.term_years} years costs ${fmtMoney(result.payment_per_period)} per period — ${fmtMoney(result.total_interest)} in total interest.`
            : `At ${fmtMoney(inputs.installment_amount)} per period, this takes ${result.periods_to_payoff} periods (${result.years_to_payoff} years) — ${fmtMoney(result.total_interest)} in total interest.`}
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          {mode === "fixed_time" ? (
            <>
              <ResultTile label="Payment Per Period" value={fmtMoney(result.payment_per_period)} />
              <ResultTile label="Total Paid" value={fmtMoney(result.total_paid)} />
              <ResultTile label="Total Interest" value={fmtMoney(result.total_interest)} />
            </>
          ) : (
            <>
              <ResultTile label="Periods to Pay Off" value={`${result.periods_to_payoff} (${result.years_to_payoff} yr)`} />
              <ResultTile label="Total Paid" value={fmtMoney(result.total_paid)} />
              <ResultTile label="Total Interest" value={fmtMoney(result.total_interest)} />
            </>
          )}
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy title="Repayment Calculator" description={MODE_COPY[mode]} />
      <CalcTabs tabs={TABS} active={mode} onChange={switchMode} />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
