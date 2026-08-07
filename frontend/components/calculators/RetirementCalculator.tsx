"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  CalcOptionalSection,
  CalcAnswer,
  CalcViewToggle,
  ScheduleTable,
  CalcEmptyState,
} from "@/components/calculators/shared";
import { StackedGrowthChart } from "@/components/calculators/StackedGrowthChart";
import { Button } from "@/components/ui/Button";

type Mode = "need" | "save" | "withdraw" | "longevity";

const TABS: { key: Mode; label: string }[] = [
  { key: "need", label: "How Much to Retire" },
  { key: "save", label: "How to Save" },
  { key: "withdraw", label: "How Much to Withdraw" },
  { key: "longevity", label: "How Long It Lasts" },
];

function AgeChart({ data, goal, goalLabel }: { data: { age: number; balance: number }[]; goal?: number; goalLabel?: string }) {
  if (data.length < 2) return <p className="text-xs text-nw-muted">Not enough data yet.</p>;
  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid stroke="var(--nw-border)" vertical={false} />
          <XAxis dataKey="age" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => money(v)} />
          <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
          {goal != null && (
            <ReferenceLine
              y={goal}
              ifOverflow="extendDomain"
              stroke="var(--nw-amber)"
              strokeDasharray="4 4"
              label={{ value: goalLabel ?? "Goal", position: "insideTopLeft", fill: "var(--nw-amber)", fontSize: 10 }}
            />
          )}
          <Line type="monotone" dataKey="balance" stroke="var(--nw-green)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RetirementNeedTab() {
  const [inputs, setInputs] = useState({
    current_age: 35,
    retirement_age: 65,
    life_expectancy: 90,
    current_income: 80000,
    current_savings: 20000,
    annual_income_increase: 0.02,
    income_replacement_pct: 0.8,
    avg_return: 0.06,
    inflation_rate: 0.03,
    other_income_monthly: 0,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");

  function calculate(overrides = inputs) {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/retirement-need", overrides)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  async function resetToMyNumbers() {
    const defaults = await api.get<Partial<typeof inputs>>("/calculators/retirement-need/defaults");
    const merged = { ...inputs, ...defaults };
    setInputs(merged);
    calculate(merged);
  }

  const schedule = (result?.schedule as { age: number; balance: number }[]) ?? [];

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol><NumField label="Current Age" value={inputs.current_age} onChange={(v) => setInputs((i) => ({ ...i, current_age: v }))} /></CalcCol>
        <CalcCol><NumField label="Retirement Age" value={inputs.retirement_age} onChange={(v) => setInputs((i) => ({ ...i, retirement_age: v }))} /></CalcCol>
        <CalcCol><NumField label="Life Expectancy" value={inputs.life_expectancy} onChange={(v) => setInputs((i) => ({ ...i, life_expectancy: v }))} /></CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol><NumField label="Current Income" prefix="$" value={inputs.current_income} onChange={(v) => setInputs((i) => ({ ...i, current_income: v }))} /></CalcCol>
        <CalcCol>
          <NumField
            label="Annual Raise"
            percent
            value={inputs.annual_income_increase}
            onChange={(v) => setInputs((i) => ({ ...i, annual_income_increase: v }))}
            helper="Typical raise pace is 2-3%/yr."
          />
        </CalcCol>
        <CalcCol>
          <NumField
            label="Replacement Income"
            percent
            value={inputs.income_replacement_pct}
            onChange={(v) => setInputs((i) => ({ ...i, income_replacement_pct: v }))}
            helper="Most households need 70-85%."
          />
        </CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField
            label="Average Investment Return"
            percent
            value={inputs.avg_return}
            onChange={(v) => setInputs((i) => ({ ...i, avg_return: v }))}
            helper="10–12% is a good place to start. That’s what the S&P 500 has averaged annually over the last 30 years."
          />
        </CalcCol>
        <CalcCol><NumField label="Inflation Rate" percent value={inputs.inflation_rate} onChange={(v) => setInputs((i) => ({ ...i, inflation_rate: v }))} /></CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol><NumField label="Current Retirement Savings" prefix="$" value={inputs.current_savings} onChange={(v) => setInputs((i) => ({ ...i, current_savings: v }))} /></CalcCol>
      </CalcRow>
      <CalcOptionalSection>
        <NumField
          label="Other Income After Retirement (monthly)"
          prefix="$"
          value={inputs.other_income_monthly}
          onChange={(v) => setInputs((i) => ({ ...i, other_income_monthly: v }))}
          helper="Social Security or a pension, if any."
        />
      </CalcOptionalSection>
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
          {result.on_track
            ? `You're on track — your savings are projected to reach ${fmtMoney(result.projected_savings_at_retirement)} by age ${inputs.retirement_age}, a ${fmtMoney(Math.abs(Number(result.surplus_or_shortfall)))} surplus over your ${fmtMoney(result.required_balance)} target nest egg.`
            : `You need to contribute an extra ${fmtMoney(result.required_additional_monthly_savings)} per month to hit your target required nest egg of ${fmtMoney(result.required_balance)} at age ${inputs.retirement_age}.`}
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Nest Egg Needed" value={fmtMoney(result.required_balance)} />
          <ResultTile label="Projected at Retirement" value={fmtMoney(result.projected_savings_at_retirement)} />
          {!result.on_track && (
            <ResultTile label="Extra Monthly Savings Needed" value={fmtMoney(result.required_additional_monthly_savings)} />
          )}
        </div>
        <CalcViewToggle view={view} onChange={setView} />
        {view === "chart" ? (
          <AgeChart data={schedule} goal={Number(result.required_balance)} goalLabel="Nest egg goal" />
        ) : (
          <ScheduleTable
            rows={schedule}
            columns={[
              { key: "age", label: "Age" },
              { key: "balance", label: "Projected Balance", format: "money" },
            ]}
          />
        )}
      </div>
    );

  return <CalcLayout inputs={inputsPanel} results={resultsPanel} />;
}

function RetirementSavingsPlanTab() {
  const [inputs, setInputs] = useState({
    current_age: 35,
    retirement_age: 65,
    amount_needed_at_retirement: 1000000,
    current_retirement_savings: 20000,
    avg_investment_return: 0.06,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");

  function calculate(overrides = inputs) {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/retirement-savings-plan", overrides)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  async function resetToMyNumbers() {
    const defaults = await api.get<Partial<typeof inputs>>("/calculators/retirement-savings-plan/defaults");
    const merged = { ...inputs, ...defaults };
    setInputs(merged);
    calculate(merged);
  }

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol><NumField label="Current Age" value={inputs.current_age} onChange={(v) => setInputs((i) => ({ ...i, current_age: v }))} /></CalcCol>
        <CalcCol><NumField label="Retirement Age" value={inputs.retirement_age} onChange={(v) => setInputs((i) => ({ ...i, retirement_age: v }))} /></CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol><NumField label="Current Savings" prefix="$" value={inputs.current_retirement_savings} onChange={(v) => setInputs((i) => ({ ...i, current_retirement_savings: v }))} /></CalcCol>
        <CalcCol><NumField label="Amount Needed" prefix="$" value={inputs.amount_needed_at_retirement} onChange={(v) => setInputs((i) => ({ ...i, amount_needed_at_retirement: v }))} /></CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField
            label="Average Investment Return"
            percent
            value={inputs.avg_investment_return}
            onChange={(v) => setInputs((i) => ({ ...i, avg_investment_return: v }))}
            helper="10-12% is a good place to start — that's what the S&P 500 has averaged annually over the last 30 years."
          />
        </CalcCol>
      </CalcRow>
      <div className="flex flex-col gap-2 pt-1">
        <CalcButton onClick={() => calculate()} loading={loading} />
        <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>
      </div>
    </>
  );

  const schedule = (result?.schedule as { age: number; balance: number; starting_balance: number; contributions_to_date: number }[]) ?? [];
  const stackedData = schedule.map((row) => ({
    label: row.age,
    starting: row.starting_balance,
    contributions: row.contributions_to_date,
    growth: Math.max(0, row.balance - row.starting_balance - row.contributions_to_date),
  }));

  const resultsPanel =
    result === null ? (
      <CalcEmptyState />
    ) : result.error ? (
      <p className="text-xs text-nw-coral">{String(result.error)}</p>
    ) : (
      <div className="flex flex-col gap-3">
        <CalcAnswer>
          {result.already_on_track
            ? `You're already on track to reach ${fmtMoney(inputs.amount_needed_at_retirement)} from your current savings alone by age ${inputs.retirement_age}.`
            : `Save ${fmtMoney(result.required_monthly_contribution)} per month starting now to reach your ${fmtMoney(inputs.amount_needed_at_retirement)} goal by age ${inputs.retirement_age}.`}
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Required Monthly Savings" value={fmtMoney(result.required_monthly_contribution)} />
          <ResultTile label="From Current Savings Alone" value={fmtMoney(result.projected_from_current_savings_alone)} />
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

  return <CalcLayout inputs={inputsPanel} results={resultsPanel} />;
}

function RetirementWithdrawalTab() {
  const [inputs, setInputs] = useState({
    current_age: 55,
    retirement_age: 65,
    life_expectancy: 90,
    current_retirement_savings: 300000,
    monthly_contribution: 1000,
    avg_investment_return: 0.06,
    inflation_rate: 0.03,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");

  function calculate(overrides = inputs) {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/retirement-withdrawal", overrides)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  async function resetToMyNumbers() {
    const defaults = await api.get<Partial<typeof inputs>>("/calculators/retirement-withdrawal/defaults");
    const merged = { ...inputs, ...defaults };
    setInputs(merged);
    calculate(merged);
  }

  const schedule = (result?.schedule as { age: number; balance: number }[]) ?? [];

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol><NumField label="Current Age" value={inputs.current_age} onChange={(v) => setInputs((i) => ({ ...i, current_age: v }))} /></CalcCol>
        <CalcCol><NumField label="Retirement Age" value={inputs.retirement_age} onChange={(v) => setInputs((i) => ({ ...i, retirement_age: v }))} /></CalcCol>
        <CalcCol><NumField label="Life Expectancy" value={inputs.life_expectancy} onChange={(v) => setInputs((i) => ({ ...i, life_expectancy: v }))} /></CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol><NumField label="Current Savings" prefix="$" value={inputs.current_retirement_savings} onChange={(v) => setInputs((i) => ({ ...i, current_retirement_savings: v }))} /></CalcCol>
        <CalcCol><NumField label="Monthly Contributions" prefix="$" value={inputs.monthly_contribution} onChange={(v) => setInputs((i) => ({ ...i, monthly_contribution: v }))} /></CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField
            label="Average Investment Return"
            percent
            value={inputs.avg_investment_return}
            onChange={(v) => setInputs((i) => ({ ...i, avg_investment_return: v }))}
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
          You can withdraw {fmtMoney(result.sustainable_monthly_withdrawal)} per month in retirement with a projected retirement
          nest egg of {fmtMoney(result.balance_at_retirement)} at age {inputs.retirement_age}.
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Balance at Retirement" value={fmtMoney(result.balance_at_retirement)} />
          <ResultTile label="Sustainable Monthly Withdrawal" value={fmtMoney(result.sustainable_monthly_withdrawal)} />
        </div>
        <CalcViewToggle view={view} onChange={setView} />
        {view === "chart" ? (
          <AgeChart data={schedule} />
        ) : (
          <ScheduleTable rows={schedule} columns={[{ key: "age", label: "Age" }, { key: "balance", label: "Balance", format: "money" }]} />
        )}
      </div>
    );

  return <CalcLayout inputs={inputsPanel} results={resultsPanel} />;
}

function RetirementLongevityTab() {
  const [inputs, setInputs] = useState({
    retirement_age: 65,
    life_expectancy: 90,
    retirement_savings_at_retirement: 500000,
    planned_withdrawal_amount: 3000,
    avg_investment_return: 0.06,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");

  function calculate() {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/retirement-longevity", inputs)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  const schedule = (result?.schedule as { age: number; balance: number }[]) ?? [];

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol><NumField label="Retirement Age" value={inputs.retirement_age} onChange={(v) => setInputs((i) => ({ ...i, retirement_age: v }))} /></CalcCol>
        <CalcCol><NumField label="Life Expectancy" value={inputs.life_expectancy} onChange={(v) => setInputs((i) => ({ ...i, life_expectancy: v }))} /></CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField
            label="Retirement Balance (at Retirement)"
            prefix="$"
            value={inputs.retirement_savings_at_retirement}
            onChange={(v) => setInputs((i) => ({ ...i, retirement_savings_at_retirement: v }))}
          />
        </CalcCol>
        <CalcCol>
          <NumField
            label="Monthly Retirement Withdrawal"
            prefix="$"
            value={inputs.planned_withdrawal_amount}
            onChange={(v) => setInputs((i) => ({ ...i, planned_withdrawal_amount: v }))}
          />
        </CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField
            label="Average Investment Return"
            percent
            value={inputs.avg_investment_return}
            onChange={(v) => setInputs((i) => ({ ...i, avg_investment_return: v }))}
            helper="10–12% is a good place to start. That’s what the S&P 500 has averaged annually over the last 30 years."
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
    ) : (
      <div className="flex flex-col gap-3">
        <CalcAnswer>
          {result.lasts_indefinitely
            ? `Your money lasts indefinitely at this withdrawal rate — projected surplus of ${fmtMoney(result.balance_at_life_expectancy)} by your life expectancy of age ${inputs.life_expectancy}.`
            : (() => {
                const diff = Number(result.years_before_after_life_expectancy);
                const beforeAfter = diff < 0 ? "before" : "after";
                const shortfallOrSurplus = Number(result.balance_at_life_expectancy) < 0 ? "shortfall" : "surplus";
                return `You'll run out of money at age ${result.depletion_age}, which is ${Math.abs(diff)} years ${beforeAfter} your life expectancy of ${inputs.life_expectancy}. This results in a ${shortfallOrSurplus} of ${fmtMoney(Math.abs(Number(result.balance_at_life_expectancy)))} at age ${inputs.life_expectancy}.`;
              })()}
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Lasts" value={result.lasts_indefinitely ? "Indefinitely" : `Age ${result.depletion_age}`} />
        </div>
        <CalcViewToggle view={view} onChange={setView} />
        {view === "chart" ? (
          <AgeChart data={schedule} />
        ) : (
          <ScheduleTable rows={schedule} columns={[{ key: "age", label: "Age" }, { key: "balance", label: "Balance", format: "money" }]} />
        )}
      </div>
    );

  return <CalcLayout inputs={inputsPanel} results={resultsPanel} />;
}

export function RetirementCalculator() {
  const [mode, setMode] = useState<Mode>("need");

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="Retirement Calculator"
        description="Four ways to look at retirement readiness: how much you need to have saved, how to get there, how much you can safely withdraw, and how long your money will last. Pick the question you want answered."
      />
      <CalcTabs tabs={TABS} active={mode} onChange={setMode} />
      {mode === "need" && <RetirementNeedTab />}
      {mode === "save" && <RetirementSavingsPlanTab />}
      {mode === "withdraw" && <RetirementWithdrawalTab />}
      {mode === "longevity" && <RetirementLongevityTab />}
    </div>
  );
}
