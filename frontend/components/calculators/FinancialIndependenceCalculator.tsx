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
  CalcLayout,
  CalcRow,
  CalcCol,
  CalcAnswer,
  CalcViewToggle,
  ScheduleTable,
  CalcEmptyState,
} from "@/components/calculators/shared";
import { Button } from "@/components/ui/Button";

function YearChart({ data }: { data: { year: number; balance: number }[] }) {
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

export function FinancialIndependenceCalculator() {
  const [inputs, setInputs] = useState({
    current_net_worth: 100000,
    annual_savings: 30000,
    annual_expenses: 60000,
    expected_return: 0.07,
    withdrawal_rate: 0.04,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");

  function calculate(overrides = inputs) {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/financial-independence", overrides)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  async function resetToMyNumbers() {
    const defaults = await api.get<Partial<typeof inputs>>("/calculators/financial-independence/defaults");
    const merged = { ...inputs, ...defaults };
    setInputs(merged);
    calculate(merged);
  }

  const schedule = (result?.schedule as { year: number; balance: number }[]) ?? [];

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol>
          <NumField label="Current Balance" prefix="$" value={inputs.current_net_worth} onChange={(v) => setInputs((i) => ({ ...i, current_net_worth: v }))} />
        </CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol><NumField label="Annual Savings" prefix="$" value={inputs.annual_savings} onChange={(v) => setInputs((i) => ({ ...i, annual_savings: v }))} /></CalcCol>
        <CalcCol><NumField label="Annual Expenses" prefix="$" value={inputs.annual_expenses} onChange={(v) => setInputs((i) => ({ ...i, annual_expenses: v }))} /></CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol><NumField label="Expected Return" percent value={inputs.expected_return} onChange={(v) => setInputs((i) => ({ ...i, expected_return: v }))} /></CalcCol>
        <CalcCol><NumField label="Withdrawal Rate" percent value={inputs.withdrawal_rate} onChange={(v) => setInputs((i) => ({ ...i, withdrawal_rate: v }))} /></CalcCol>
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
    ) : (
      <div className="flex flex-col gap-3">
        <CalcAnswer>
          {result.already_fi
            ? `You're already financially independent — your ${fmtMoney(inputs.current_net_worth)} balance covers your ${fmtMoney(result.fi_number)} FI number.`
            : `You'll reach financial independence in ${result.years_to_fi} years, once your balance hits ${fmtMoney(result.fi_number)}.`}
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="FI Number" value={fmtMoney(result.fi_number)} />
          <ResultTile label="Years to FI" value={result.already_fi ? "0" : String(result.years_to_fi ?? "—")} />
        </div>
        {schedule.length > 1 && (
          <>
            <CalcViewToggle view={view} onChange={setView} />
            {view === "chart" ? (
              <YearChart data={schedule} />
            ) : (
              <ScheduleTable rows={schedule} columns={[{ key: "year", label: "Year" }, { key: "balance", label: "Balance", format: "money" }]} />
            )}
          </>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="Financial Independence Calculator"
        description="The classic 'save 25x your annual expenses' rule: your FI number is annual expenses divided by a chosen safe withdrawal rate. Distinct from the Retirement Calculator — this answers 'when am I FI', not 'will my drawdown last'."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
