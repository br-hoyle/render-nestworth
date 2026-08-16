"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { money, formatFullDate } from "@/lib/format";
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
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";

interface Result {
  monthly_payment: string;
  months_to_payoff: number | null;
  years_to_payoff: string | null;
  payoff_date: string | null;
  total_interest: string;
  total_paid: string;
  interest_saved: string;
  months_saved: number | null;
  yearly_schedule: { year: number; principal: number; interest: number; balance: number }[];
}

function YearlyBalanceChart({ data }: { data: { year: number; balance: number }[] }) {
  if (data.length < 2) return <p className="text-xs text-nw-muted">Not enough data yet.</p>;
  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid stroke="var(--nw-border)" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => money(v)} />
          <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
          <Line type="monotone" dataKey="balance" name="Balance" stroke="var(--nw-green)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const TODAY = new Date().toISOString().slice(0, 10);

export function AmortizationCalculator() {
  const [principal, setPrincipal] = useState(300000);
  const [startDate, setStartDate] = useState(TODAY);
  const [annualRate, setAnnualRate] = useState(0.1);
  const [termYears, setTermYears] = useState(30);
  const [extraMonthly, setExtraMonthly] = useState(0);
  const [extraMonthlyStartDate, setExtraMonthlyStartDate] = useState(TODAY);
  const [extraYearly, setExtraYearly] = useState(0);
  const [extraYearlyStartDate, setExtraYearlyStartDate] = useState(TODAY);
  const [extraOneTime, setExtraOneTime] = useState(0);
  const [extraOneTimeDate, setExtraOneTimeDate] = useState(TODAY);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");

  function calculate(overridePrincipal = principal) {
    setLoading(true);
    api
      .post<Result>("/calculators/amortization", {
        principal: overridePrincipal,
        annual_rate: annualRate,
        term_years: termYears,
        start_date: startDate,
        extra_monthly: extraMonthly,
        extra_monthly_start_date: extraMonthlyStartDate,
        extra_yearly: extraYearly,
        extra_yearly_start_date: extraYearlyStartDate,
        extra_one_time: extraOneTime,
        extra_one_time_date: extraOneTimeDate,
      })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  async function resetToMyNumbers() {
    const defaults = await api.get<{ principal?: string }>("/calculators/amortization/defaults");
    if (defaults.principal) {
      const p = Number(defaults.principal);
      setPrincipal(p);
      calculate(p);
    }
  }

  const schedule = result?.yearly_schedule ?? [];
  const chartData = schedule.map((s) => ({ year: s.year, balance: Number(s.balance) }));

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol>
          <NumField label="Loan Amount" prefix="$" value={principal} onChange={setPrincipal} />
        </CalcCol>
        <CalcCol>
          <TextField label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField label="Loan Term (Years)" value={termYears} onChange={setTermYears} />
        </CalcCol>
        <CalcCol>
          <NumField label="Interest Rate" percent value={annualRate} onChange={setAnnualRate} />
        </CalcCol>
      </CalcRow>
      <CalcOptionalSection>
        <div className="flex flex-col gap-3 max-w-md">
          <CalcRow>
            <CalcCol>
              <NumField
                label="Extra Monthly"
                prefix="$"
                value={extraMonthly}
                onChange={setExtraMonthly}
                helper="Applied every month from the start date onward."
              />
            </CalcCol>
            <CalcCol>
              <TextField label="Start At" type="date" value={extraMonthlyStartDate} onChange={(e) => setExtraMonthlyStartDate(e.target.value)} />
            </CalcCol>
          </CalcRow>
          <CalcRow>
            <CalcCol>
              <NumField
                label="Extra Yearly"
                prefix="$"
                value={extraYearly}
                onChange={setExtraYearly}
                helper="Applied once a year, e.g. a tax refund or bonus."
              />
            </CalcCol>
            <CalcCol>
              <TextField label="Start At" type="date" value={extraYearlyStartDate} onChange={(e) => setExtraYearlyStartDate(e.target.value)} />
            </CalcCol>
          </CalcRow>
          <CalcRow>
            <CalcCol>
              <NumField label="Extra One-Time" prefix="$" value={extraOneTime} onChange={setExtraOneTime} />
            </CalcCol>
            <CalcCol>
              <TextField label="Payment Date" type="date" value={extraOneTimeDate} onChange={(e) => setExtraOneTimeDate(e.target.value)} />
            </CalcCol>
          </CalcRow>
        </div>
      </CalcOptionalSection>
      <div className="flex flex-col gap-2 pt-1">
        <CalcButton onClick={() => calculate()} loading={loading} />
        <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>
      </div>
      <p className="text-[10px] text-nw-muted">Prefilled from your mortgage account, if you have one — but works for any loan.</p>
    </>
  );

  const resultsPanel =
    result === null ? (
      <CalcEmptyState />
    ) : (
      <div className="flex flex-col gap-3">
        <CalcAnswer>
          {result.months_saved && result.months_saved > 0
            ? `These extra payments pay this off ${result.months_saved} months early, saving ${fmtMoney(result.interest_saved)} in interest.`
            : `Paying ${fmtMoney(result.monthly_payment)}/mo pays this off in ${result.years_to_payoff} years — ${fmtMoney(result.total_interest)} in total interest.`}
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Monthly Payment" value={fmtMoney(result.monthly_payment)} />
          <ResultTile
            label="Payoff Time"
            value={result.years_to_payoff != null ? `${result.years_to_payoff} years` : "—"}
          />
          <ResultTile label="Payoff Date" value={result.payoff_date ? formatFullDate(result.payoff_date) : "—"} />
          <ResultTile label="Total Interest" value={fmtMoney(result.total_interest)} />
          <ResultTile label="Interest Saved" value={fmtMoney(result.interest_saved)} />
          <ResultTile label="Time Saved" value={result.months_saved != null ? `${result.months_saved} mo` : "—"} />
        </div>
        <CalcViewToggle view={view} onChange={setView} />
        {view === "chart" ? (
          <YearlyBalanceChart data={chartData} />
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
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="Amortization Calculator"
        description="See exactly how each payment splits between principal and interest — and how much time and interest an extra monthly, yearly, or one-time payment could save you."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
