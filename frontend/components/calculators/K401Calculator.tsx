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
  CalcAnswer,
  CalcViewToggle,
  ScheduleTable,
  CalcEmptyState,
} from "@/components/calculators/shared";
import { StackedGrowthChart } from "@/components/calculators/StackedGrowthChart";
import { Button } from "@/components/ui/Button";

export function K401Calculator() {
  const [inputs, setInputs] = useState({
    current_age: 30,
    annual_income: 80000,
    retirement_age: 65,
    current_balance: 10000,
    contribution_pct: 0.06,
    employer_match_pct: 0.5,
    employer_match_limit_pct: 0.06,
    life_expectancy: 90,
    annual_income_increase: 0.02,
    avg_return: 0.07,
    inflation_rate: 0.03,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");

  function calculate(overrides = inputs) {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/401k", overrides)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  async function resetToMyNumbers() {
    const defaults = await api.get<Partial<typeof inputs>>("/calculators/401k/defaults");
    const merged = { ...inputs, ...defaults };
    setInputs(merged);
    calculate(merged);
  }

  const schedule = (result?.schedule as { age: number; balance: number; starting_balance: number; contributions_to_date: number }[]) ?? [];
  const stackedData = schedule.map((row) => ({
    label: row.age,
    starting: row.starting_balance,
    contributions: row.contributions_to_date,
    growth: Math.max(0, row.balance - row.starting_balance - row.contributions_to_date),
  }));

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol><NumField label="Current Age" value={inputs.current_age} onChange={(v) => setInputs((i) => ({ ...i, current_age: v }))} /></CalcCol>
        <CalcCol><NumField label="Retirement Age" value={inputs.retirement_age} onChange={(v) => setInputs((i) => ({ ...i, retirement_age: v }))} /></CalcCol>
        <CalcCol><NumField label="Life Expectancy" value={inputs.life_expectancy} onChange={(v) => setInputs((i) => ({ ...i, life_expectancy: v }))} /></CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol><NumField label="Annual Income" prefix="$" value={inputs.annual_income} onChange={(v) => setInputs((i) => ({ ...i, annual_income: v }))} /></CalcCol>
        <CalcCol>
          <NumField
            label="Annual Raise"
            percent
            value={inputs.annual_income_increase}
            onChange={(v) => setInputs((i) => ({ ...i, annual_income_increase: v }))}
          />
        </CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField label="Current Balance" prefix="$" value={inputs.current_balance} onChange={(v) => setInputs((i) => ({ ...i, current_balance: v }))} />
        </CalcCol>
        <CalcCol>
          <NumField
            label="Your Contribution"
            percent
            value={inputs.contribution_pct}
            onChange={(v) => setInputs((i) => ({ ...i, contribution_pct: v }))}
            helper="% of salary you contribute each paycheck."
          />
        </CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField
            label="Employer Match"
            percent
            value={inputs.employer_match_pct}
            onChange={(v) => setInputs((i) => ({ ...i, employer_match_pct: v }))}
            helper="e.g. 50% means $0.50 per dollar you contribute, up to the limit."
          />
        </CalcCol>
        <CalcCol>
          <NumField
            label="Employer Match Limit"
            percent
            value={inputs.employer_match_limit_pct}
            onChange={(v) => setInputs((i) => ({ ...i, employer_match_limit_pct: v }))}
            helper="The % of salary your employer will match up to."
          />
        </CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField
            label="Annual Investment Return"
            percent
            value={inputs.avg_return}
            onChange={(v) => setInputs((i) => ({ ...i, avg_return: v }))}
            helper="10–12% is a good place to start. That’s what the S&P 500 has averaged annually over the last 30 years."
          />
        </CalcCol>
        <CalcCol><NumField label="Inflation Rate" percent value={inputs.inflation_rate} onChange={(v) => setInputs((i) => ({ ...i, inflation_rate: v }))} /></CalcCol>
      </CalcRow>
      <div className="flex flex-col gap-2 pt-1">
        <CalcButton onClick={() => calculate()} loading={loading} />
        <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>
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
          Your 401(k) is projected to reach {fmtMoney(result.balance_at_retirement)} by age {inputs.retirement_age} (including{" "}
          {fmtMoney(result.total_employer_match)} in employer match) — enough to support {fmtMoney(result.sustainable_monthly_income)} per month in
          retirement.
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Balance at Retirement" value={fmtMoney(result.balance_at_retirement)} />
          <ResultTile label="Total Employer Match" value={fmtMoney(result.total_employer_match)} />
          <ResultTile label="Sustainable Monthly Income" value={fmtMoney(result.sustainable_monthly_income)} />
        </div>
        <CalcViewToggle view={view} onChange={setView} />
        {view === "chart" ? (
          <StackedGrowthChart data={stackedData} xLabel="age" />
        ) : (
          <ScheduleTable
            rows={schedule}
            columns={[
              { key: "age", label: "Age" },
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
        title="401(k) Calculator"
        description="Project your 401(k) balance at retirement — including your employer's match — and see roughly how much sustainable monthly income it could support once you get there."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
