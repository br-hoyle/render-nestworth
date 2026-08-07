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
  CalcRow,
  CalcCol,
  CalcAnswer,
  CalcViewToggle,
  ScheduleTable,
  CalcEmptyState,
  SelectField,
} from "@/components/calculators/shared";
import { FREQUENCY_OPTIONS, type CompoundFrequency } from "@/lib/calculatorTypes";

type LoanType = "amortized" | "deferred" | "bond";

const TABS: { key: LoanType; label: string }[] = [
  { key: "amortized", label: "Amortized Loan" },
  { key: "deferred", label: "Deferred Payment Loan" },
  { key: "bond", label: "Bond" },
];

const MODE_COPY: Record<LoanType, string> = {
  amortized:
    "Paying back a fixed amount with regular payments — the common shape for mortgages, auto loans, student loans, or personal loans. Each payment covers that period's interest, with the remainder reducing the balance.",
  deferred: "Nothing is paid until maturity, when the entire accrued amount comes due at once — interest compounds on itself the whole way.",
  bond:
    "The mirror image of a deferred loan — given a fixed amount due at maturity, this solves for what that's worth today by discounting it back at the given rate.",
};

const AMOUNT_LABEL: Record<LoanType, string> = {
  amortized: "Loan Amount",
  deferred: "Loan Amount",
  bond: "Amount Due",
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
  const [view, setView] = useState<"chart" | "table">("chart");
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
      <CalcRow>
        <CalcCol>
          <NumField
            label={AMOUNT_LABEL[loanType]}
            prefix="$"
            value={inputs.principal}
            onChange={(v) => setInputs((i) => ({ ...i, principal: v }))}
          />
        </CalcCol>
        <CalcCol>
          <NumField label="Term (Years)" value={inputs.term_years} onChange={(v) => setInputs((i) => ({ ...i, term_years: v }))} />
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
        {loanType === "amortized" && (
          <CalcCol>
            <SelectField
              label="Payback Frequency"
              value={inputs.payback_frequency}
              onChange={(v) => setInputs((i) => ({ ...i, payback_frequency: v }))}
              options={FREQUENCY_OPTIONS}
            />
          </CalcCol>
        )}
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
          {loanType === "amortized" &&
            `Paying this off over ${inputs.term_years} years costs ${fmtMoney(result.payment_per_period)} per period — ${fmtMoney(result.total_interest)} in total interest.`}
          {loanType === "deferred" &&
            `Left untouched for ${inputs.term_years} years, this grows to ${fmtMoney(result.amount_due_at_maturity)} due at maturity — ${fmtMoney(result.total_interest)} in accrued interest.`}
          {loanType === "bond" &&
            `To be worth ${fmtMoney(inputs.principal)} in ${inputs.term_years} years, this is worth ${fmtMoney(result.initial_value)} today.`}
        </CalcAnswer>
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
        {loanType === "amortized" && (
          <>
            <CalcViewToggle view={view} onChange={setView} />
            {view === "chart" ? (
              <YearlyBalanceChart data={schedule} />
            ) : (
              <ScheduleTable
                rows={schedule}
                columns={[
                  { key: "year", label: "Year" },
                  { key: "principal", label: "Principal Paid", format: "money" },
                  { key: "interest", label: "Interest Paid", format: "money" },
                  { key: "balance", label: "Balance", format: "money" },
                ]}
              />
            )}
          </>
        )}
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
