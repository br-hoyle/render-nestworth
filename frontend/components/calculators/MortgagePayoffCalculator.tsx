"use client";

import { useEffect, useState } from "react";
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
} from "@/components/calculators/shared";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";

type RepaymentOption = "extra_payments" | "biweekly";

const TABS: { key: RepaymentOption; label: string }[] = [
  { key: "extra_payments", label: "Extra Payments" },
  { key: "biweekly", label: "Bi-Weekly Payment" },
];

const MODE_COPY: Record<RepaymentOption, string> = {
  extra_payments: "Continue at the original payment, plus an extra monthly, yearly, and/or one-time payment.",
  biweekly:
    "Pay half the monthly payment every two weeks instead — 26 payments a year, the equivalent of 13 monthly payments — optionally with its own extra payments layered on top.",
};

interface Result {
  error?: string;
  current_balance: string;
  months_to_payoff: number | null;
  years_to_payoff: string | null;
  payoff_date: string | null;
  total_interest: string;
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

export function MortgagePayoffCalculator() {
  const [option, setOption] = useState<RepaymentOption>("extra_payments");
  const [originalPrincipal, setOriginalPrincipal] = useState(300000);
  const [startDate, setStartDate] = useState(TODAY);
  const [originalTermYears, setOriginalTermYears] = useState(30);
  const [annualRate, setAnnualRate] = useState(0.1);
  const [remainingTermYears, setRemainingTermYears] = useState(25);
  const [extraMonthly, setExtraMonthly] = useState(0);
  const [extraMonthlyStartDate, setExtraMonthlyStartDate] = useState(TODAY);
  const [extraYearly, setExtraYearly] = useState(0);
  const [extraYearlyStartDate, setExtraYearlyStartDate] = useState(TODAY);
  const [extraOneTime, setExtraOneTime] = useState(0);
  const [extraOneTimeDate, setExtraOneTimeDate] = useState(TODAY);
  const [extraBiweekly, setExtraBiweekly] = useState(0);
  const [extraBiweeklyStartDate, setExtraBiweeklyStartDate] = useState(TODAY);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");

  function calculate(overridePrincipal = originalPrincipal) {
    setLoading(true);
    api
      .post<Result>("/calculators/mortgage-payoff", {
        original_principal: overridePrincipal,
        original_term_years: originalTermYears,
        annual_rate: annualRate,
        start_date: startDate,
        remaining_term_years: remainingTermYears,
        repayment_option: option,
        extra_monthly: extraMonthly,
        extra_monthly_start_date: extraMonthlyStartDate,
        extra_yearly: extraYearly,
        extra_yearly_start_date: extraYearlyStartDate,
        extra_one_time: extraOneTime,
        extra_one_time_date: extraOneTimeDate,
        extra_biweekly: extraBiweekly,
        extra_biweekly_start_date: extraBiweeklyStartDate,
      })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    api.get<{ original_principal?: string }>("/calculators/mortgage-payoff/defaults").then((defaults) => {
      if (defaults.original_principal) setOriginalPrincipal(Number(defaults.original_principal));
    });
  }, []);

  async function resetToMyNumbers() {
    const defaults = await api.get<{ original_principal?: string }>("/calculators/mortgage-payoff/defaults");
    if (defaults.original_principal) {
      const p = Number(defaults.original_principal);
      setOriginalPrincipal(p);
      calculate(p);
    }
  }

  function switchOption(next: RepaymentOption) {
    setOption(next);
    setResult(null);
  }

  const schedule = result?.yearly_schedule ?? [];
  const chartData = schedule.map((s) => ({ year: s.year, balance: Number(s.balance) }));

  const inputsPanel = (
    <>
      {option === "extra_payments" ? (
        <>
          <CalcRow>
            <CalcCol>
              <NumField label="Loan Amount" prefix="$" value={originalPrincipal} onChange={setOriginalPrincipal} />
            </CalcCol>
            <CalcCol>
              <TextField label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </CalcCol>
            <CalcCol>
              <NumField label="Interest Rate" percent value={annualRate} onChange={setAnnualRate} />
            </CalcCol>
          </CalcRow>
          <CalcRow>
            <CalcCol>
              <NumField label="Original Loan Term" value={originalTermYears} onChange={setOriginalTermYears} />
            </CalcCol>
            <CalcCol>
              <NumField label="Remaining Term (Years)" value={remainingTermYears} onChange={setRemainingTermYears} />
            </CalcCol>
          </CalcRow>
        </>
      ) : (
        <>
          <CalcRow>
            <CalcCol>
              <NumField label="Loan Amount" prefix="$" value={originalPrincipal} onChange={setOriginalPrincipal} />
            </CalcCol>
            <CalcCol>
              <TextField label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </CalcCol>
          </CalcRow>
          <CalcRow>
            <CalcCol>
              <NumField label="Original Loan Term" value={originalTermYears} onChange={setOriginalTermYears} />
            </CalcCol>
            <CalcCol>
              <NumField label="Remaining Term (Years)" value={remainingTermYears} onChange={setRemainingTermYears} />
            </CalcCol>
            <CalcCol>
              <NumField label="Interest Rate" percent value={annualRate} onChange={setAnnualRate} />
            </CalcCol>
          </CalcRow>
          <CalcRow>
            <CalcCol>
              <NumField label="Extra Bi-Weekly" prefix="$" value={extraBiweekly} onChange={setExtraBiweekly} />
            </CalcCol>
            <CalcCol>
              <TextField label="Start At" type="date" value={extraBiweeklyStartDate} onChange={(e) => setExtraBiweeklyStartDate(e.target.value)} />
            </CalcCol>
          </CalcRow>
        </>
      )}
      <CalcRow>
        <CalcCol>
          <NumField label="Extra Monthly" prefix="$" value={extraMonthly} onChange={setExtraMonthly} />
        </CalcCol>
        <CalcCol>
          <TextField label="Start At" type="date" value={extraMonthlyStartDate} onChange={(e) => setExtraMonthlyStartDate(e.target.value)} />
        </CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField label="Extra Yearly" prefix="$" value={extraYearly} onChange={setExtraYearly} />
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
      <div className="flex flex-col gap-2 pt-1">
        <CalcButton onClick={() => calculate()} loading={loading} />
        <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>
      </div>
      <p className="text-[10px] text-nw-muted">Prefilled from your mortgage account&apos;s current balance, if you have one.</p>
    </>
  );

  const resultsPanel =
    result === null ? (
      <CalcEmptyState />
    ) : result.error ? (
      <p className="text-xs text-nw-coral">{result.error}</p>
    ) : (
      <div className="flex flex-col gap-3">
        <CalcAnswer>
          {result.months_saved && result.months_saved > 0
            ? `This pays off ${result.months_saved} months earlier than your original schedule, saving ${fmtMoney(result.interest_saved)} in interest.`
            : `Payoff in ${result.months_to_payoff} months (${result.years_to_payoff} years), on ${result.payoff_date}.`}
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Current Balance" value={fmtMoney(result.current_balance)} />
          <ResultTile
            label="Payoff Time"
            value={result.years_to_payoff != null ? `${result.years_to_payoff} years` : "—"}
          />
          <ResultTile label="Payoff Date" value={result.payoff_date ?? "—"} />
          <ResultTile label="Total Interest" value={fmtMoney(result.total_interest)} />
          <ResultTile label="Interest Saved vs. Original" value={fmtMoney(result.interest_saved)} />
          <ResultTile label="Time Saved vs. Original" value={result.months_saved != null ? `${result.months_saved} mo` : "—"} />
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
      <CalcCopy title="Mortgage Payoff Calculator" description={MODE_COPY[option]} />
      <CalcTabs tabs={TABS} active={option} onChange={switchOption} />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
