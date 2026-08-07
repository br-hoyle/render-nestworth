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
  CalcOptionalSection,
  CalcAnswer,
  CalcViewToggle,
  ScheduleTable,
  CalcEmptyState,
} from "@/components/calculators/shared";
import { StackedGrowthChart } from "@/components/calculators/StackedGrowthChart";
import { FREQUENCY_OPTIONS, type CompoundFrequency, type ContributionTiming } from "@/lib/calculatorTypes";

type Mode = "end_amount" | "contribution" | "length";

const TABS: { key: Mode; label: string }[] = [
  { key: "end_amount", label: "End Amount" },
  { key: "contribution", label: "Contributions" },
  { key: "length", label: "Investment Length" },
];

const MODE_COPY: Record<Mode, string> = {
  end_amount: "Project what your investment grows to by the end of the term, given a starting amount and regular contributions.",
  contribution: "Solve for the regular contribution needed to reach a target amount by a chosen date.",
  length: "Solve for how long it takes to reach a target amount at a given contribution and return.",
};

export function InvestmentCalculator() {
  const [mode, setMode] = useState<Mode>("end_amount");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [inputs, setInputs] = useState({
    current_savings: 10000,
    annual_rate: 0.07,
    compound_frequency: "annually" as CompoundFrequency,
    contribution_timing: "end" as ContributionTiming,
    term_years: 20,
    contribution_amount: 500,
    target_end_amount: 500000,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  function calculate() {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/investment", { ...inputs, solve_for: mode })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  function switchMode(next: Mode) {
    setMode(next);
    setResult(null);
  }

  const schedule = (result?.schedule as { year: number; balance: number; starting_balance: number; contributions_to_date: number }[]) ?? [];
  const stackedData = schedule.map((row) => ({
    label: row.year,
    starting: row.starting_balance,
    contributions: row.contributions_to_date,
    growth: Math.max(0, row.balance - row.starting_balance - row.contributions_to_date),
  }));

  const contributeAtField = (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-nw-muted">Contribute At</span>
      <select
        value={inputs.contribution_timing}
        onChange={(e) => setInputs((i) => ({ ...i, contribution_timing: e.target.value as ContributionTiming }))}
        className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm text-nw-text"
      >
        <option value="end">End of Period</option>
        <option value="beginning">Beginning of Period</option>
      </select>
    </label>
  );

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol>
          <NumField
            label="Current Savings"
            prefix="$"
            value={inputs.current_savings}
            onChange={(v) => setInputs((i) => ({ ...i, current_savings: v }))}
          />
        </CalcCol>
        <CalcCol>
          {mode === "length" ? (
            <NumField
              label="Target End Amount"
              prefix="$"
              value={inputs.target_end_amount}
              onChange={(v) => setInputs((i) => ({ ...i, target_end_amount: v }))}
            />
          ) : (
            <NumField label="Term (Years)" value={inputs.term_years} onChange={(v) => setInputs((i) => ({ ...i, term_years: v }))} />
          )}
        </CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          {mode === "contribution" ? (
            <NumField
              label="Target End Amount"
              prefix="$"
              value={inputs.target_end_amount}
              onChange={(v) => setInputs((i) => ({ ...i, target_end_amount: v }))}
            />
          ) : (
            <NumField
              label="Contribution Amount"
              prefix="$"
              value={inputs.contribution_amount}
              onChange={(v) => setInputs((i) => ({ ...i, contribution_amount: v }))}
            />
          )}
        </CalcCol>
        <CalcCol>{contributeAtField}</CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField
            label="Annual Investment Return"
            percent
            value={inputs.annual_rate}
            onChange={(v) => setInputs((i) => ({ ...i, annual_rate: v }))}
            helper="10–12% is a good place to start. That’s what the S&P 500 has averaged annually over the last 30 years."
          />
        </CalcCol>
      </CalcRow>
      <CalcOptionalSection>
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
      </CalcOptionalSection>
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
          {mode === "end_amount" &&
            `Your investment grows to ${fmtMoney(result.end_amount)} after ${inputs.term_years} years — ${fmtMoney(result.total_contributions)} contributed, ${fmtMoney(result.total_growth)} from growth.`}
          {mode === "contribution" &&
            (result.already_met
              ? `You've already reached your ${fmtMoney(inputs.target_end_amount)} goal with your current savings alone.`
              : `Contribute ${fmtMoney(result.required_contribution)} per period to reach ${fmtMoney(inputs.target_end_amount)} in ${inputs.term_years} years.`)}
          {mode === "length" && `It takes ${result.years_needed} years to reach ${fmtMoney(inputs.target_end_amount)} at this contribution and return.`}
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          {mode === "end_amount" && (
            <>
              <ResultTile label="End Amount" value={fmtMoney(result.end_amount)} />
              <ResultTile label="Total Contributions" value={fmtMoney(result.total_contributions)} />
              <ResultTile label="Total Growth" value={fmtMoney(result.total_growth)} />
            </>
          )}
          {mode === "contribution" && <ResultTile label="Required Contribution" value={fmtMoney(result.required_contribution)} />}
          {mode === "length" && <ResultTile label="Time Needed" value={`${result.years_needed} years`} />}
        </div>
        <CalcViewToggle view={view} onChange={setView} />
        {view === "chart" ? (
          <StackedGrowthChart data={stackedData} xLabel="year" />
        ) : (
          <ScheduleTable
            rows={schedule}
            columns={[
              { key: "year", label: "Year" },
              { key: "balance", label: "Balance", format: "money" },
              { key: "contributions_to_date", label: "Contributions to Date", format: "money" },
            ]}
          />
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy title="Investment Calculator" description={MODE_COPY[mode]} />
      <CalcTabs tabs={TABS} active={mode} onChange={switchMode} />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
