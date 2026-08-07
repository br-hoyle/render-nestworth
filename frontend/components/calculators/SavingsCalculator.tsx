"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import {
  NumField,
  ResultTile,
  fmtMoney,
  CalcButton,
  CalcCopy,
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
import { FREQUENCY_OPTIONS, type CompoundFrequency } from "@/lib/calculatorTypes";

export function SavingsCalculator() {
  const [inputs, setInputs] = useState({
    starting_balance: 1000,
    monthly_contribution: 300,
    interest_rate: 0.04,
    compound_frequency: "monthly" as CompoundFrequency,
    term_years: 10,
    monthly_contribution_increase_pct: 0,
    tax_rate: 0.22,
    annual_contribution: 0,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");

  function calculate() {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/savings", inputs)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  const schedule = (result?.schedule as { year: number; balance: number; starting_balance: number; contributions_to_date: number }[]) ?? [];
  const stackedData = schedule.map((row) => ({
    label: row.year,
    starting: row.starting_balance,
    contributions: row.contributions_to_date,
    growth: Math.max(0, row.balance - row.starting_balance - row.contributions_to_date),
  }));

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol>
          <NumField label="Starting Balance" prefix="$" value={inputs.starting_balance} onChange={(v) => setInputs((i) => ({ ...i, starting_balance: v }))} />
        </CalcCol>
        <CalcCol>
          <NumField
            label="Monthly Contribution"
            prefix="$"
            value={inputs.monthly_contribution}
            onChange={(v) => setInputs((i) => ({ ...i, monthly_contribution: v }))}
          />
        </CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol><NumField label="Interest Rate" percent value={inputs.interest_rate} onChange={(v) => setInputs((i) => ({ ...i, interest_rate: v }))} /></CalcCol>
        <CalcCol>
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
        </CalcCol>
        <CalcCol><NumField label="Term (Years)" value={inputs.term_years} onChange={(v) => setInputs((i) => ({ ...i, term_years: v }))} /></CalcCol>
      </CalcRow>
      <CalcOptionalSection>
        <CalcRow>
          <CalcCol>
            <NumField
              label="Monthly Contribution Increase"
              percent
              value={inputs.monthly_contribution_increase_pct}
              onChange={(v) => setInputs((i) => ({ ...i, monthly_contribution_increase_pct: v }))}
              helper="Applied once a year, e.g. an annual raise."
            />
          </CalcCol>
          <CalcCol>
            <NumField label="Tax Rate on Interest" percent value={inputs.tax_rate} onChange={(v) => setInputs((i) => ({ ...i, tax_rate: v }))} />
          </CalcCol>
        </CalcRow>
        <CalcRow>
          <CalcCol>
            <NumField
              label="Annual Lump Sum"
              prefix="$"
              value={inputs.annual_contribution}
              onChange={(v) => setInputs((i) => ({ ...i, annual_contribution: v }))}
            />
          </CalcCol>
        </CalcRow>
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
          Your savings grow to {fmtMoney(result.final_balance)} after {inputs.term_years} years — {fmtMoney(result.total_contributions)}{" "}
          contributed, {fmtMoney(result.total_interest_after_tax)} in interest after tax.
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Final Balance" value={fmtMoney(result.final_balance)} />
          <ResultTile label="Total Contributions" value={fmtMoney(result.total_contributions)} />
          <ResultTile label="Interest Earned (After Tax)" value={fmtMoney(result.total_interest_after_tax)} />
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
      <CalcCopy
        title="Savings Calculator"
        description="Project a savings account balance with escalating contributions and tax on the interest you earn."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
