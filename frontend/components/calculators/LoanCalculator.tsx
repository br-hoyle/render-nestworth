"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import {
  NumField,
  ResultTile,
  fmtMoney,
  CalcButton,
  CalcCopy,
  CalcTabs,
  CalcLayout,
  CalcFieldGrid,
  CalcEmptyState,
} from "@/components/calculators/shared";
import { FREQUENCY_OPTIONS, type CompoundFrequency } from "@/lib/calculatorTypes";

type LoanType = "amortized" | "deferred" | "bond";

const TABS: { key: LoanType; label: string }[] = [
  { key: "amortized", label: "Amortized Loan" },
  { key: "deferred", label: "Deferred Payment Loan" },
  { key: "bond", label: "Bond" },
];

const MODE_COPY: Record<LoanType, string> = {
  amortized: "Paying back a fixed amount with regular payments — the common shape for mortgages, auto loans, student loans, or personal loans.",
  deferred: "Nothing is paid until maturity, when the entire accrued amount comes due at once.",
  bond: "The mirror image of a deferred loan — given a fixed amount due at maturity, this solves for what that's worth today.",
};

const AMOUNT_LABEL: Record<LoanType, string> = {
  amortized: "Loan Amount",
  deferred: "Loan Amount",
  bond: "Pre-Determined Due Amount",
};

function YearlyBalanceChart({ data }: { data: { year: number; balance: number }[] }) {
  if (data.length < 2) return <p className="text-xs text-nw-muted">Not enough data yet.</p>;
  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid stroke="var(--nw-border)" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => money(v)} />
          <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
          <Line type="monotone" dataKey="balance" stroke="var(--nw-green)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LoanCalculator() {
  const [loanType, setLoanType] = useState<LoanType>("amortized");
  const [inputs, setInputs] = useState({
    principal: 20000,
    annual_rate: 0.07,
    term_years: 5,
    compound_frequency: "monthly" as CompoundFrequency,
    payback_frequency: "monthly" as CompoundFrequency,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  function calculate() {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/loan", { ...inputs, loan_type: loanType })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  function switchType(next: LoanType) {
    setLoanType(next);
    setResult(null);
  }

  const schedule = (result?.yearly_schedule as { year: number; balance: number }[]) ?? [];

  const inputsPanel = (
    <>
      <CalcFieldGrid>
        <NumField
          label={AMOUNT_LABEL[loanType]}
          prefix="$"
          value={inputs.principal}
          onChange={(v) => setInputs((i) => ({ ...i, principal: v }))}
        />
        <NumField label="Term (Years)" value={inputs.term_years} onChange={(v) => setInputs((i) => ({ ...i, term_years: v }))} />
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-nw-muted">Compound Frequency</span>
          <select
            value={inputs.compound_frequency}
            onChange={(e) => setInputs((i) => ({ ...i, compound_frequency: e.target.value as CompoundFrequency }))}
            className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm text-nw-text"
          >
            {FREQUENCY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {loanType === "amortized" && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-nw-muted">Payback Frequency</span>
            <select
              value={inputs.payback_frequency}
              onChange={(e) => setInputs((i) => ({ ...i, payback_frequency: e.target.value as CompoundFrequency }))}
              className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm text-nw-text"
            >
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="sm:col-span-2 xl:col-span-3">
          <NumField label="Interest Rate" percent value={inputs.annual_rate} onChange={(v) => setInputs((i) => ({ ...i, annual_rate: v }))} />
        </div>
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
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {loanType === "amortized" && (
            <>
              <ResultTile label="Payment Per Period" value={fmtMoney(result.payment_per_period)} />
              <ResultTile label="Total Interest" value={fmtMoney(result.total_interest)} />
              <ResultTile label="Total Paid" value={fmtMoney(result.total_paid)} />
            </>
          )}
          {loanType === "deferred" && (
            <>
              <ResultTile label="Amount Due at Maturity" value={fmtMoney(result.amount_due_at_maturity)} />
              <ResultTile label="Total Interest" value={fmtMoney(result.total_interest)} />
            </>
          )}
          {loanType === "bond" && (
            <>
              <ResultTile label="Initial Value (Today)" value={fmtMoney(result.initial_value)} />
              <ResultTile label="Total Interest" value={fmtMoney(result.total_interest)} />
            </>
          )}
        </div>
        {loanType === "amortized" && <YearlyBalanceChart data={schedule} />}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy title="Loan Calculator" description={MODE_COPY[loanType]} />
      <CalcTabs tabs={TABS} active={loanType} onChange={switchType} />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
