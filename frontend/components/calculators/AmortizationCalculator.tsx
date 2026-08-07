"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { NumField, ResultTile, fmtMoney, CalcButton, CalcCopy, CalcLayout, CalcFieldGrid, CalcEmptyState } from "@/components/calculators/shared";
import { Button } from "@/components/ui/Button";

interface Result {
  monthly_payment: string;
  months_to_payoff: number | null;
  years_to_payoff: string | null;
  total_interest: string;
  total_paid: string;
  interest_saved: string;
  months_saved: number | null;
  yearly_schedule: { year: number; balance: number }[];
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
          <Line type="monotone" dataKey="balance" stroke="var(--nw-green)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AmortizationCalculator() {
  const [principal, setPrincipal] = useState(300000);
  const [annualRate, setAnnualRate] = useState(0.065);
  const [termYears, setTermYears] = useState(30);
  const [extraMonthly, setExtraMonthly] = useState(0);
  const [extraMonthlyStartMonth, setExtraMonthlyStartMonth] = useState(1);
  const [extraYearly, setExtraYearly] = useState(0);
  const [extraYearlyStartMonth, setExtraYearlyStartMonth] = useState(12);
  const [extraOneTime, setExtraOneTime] = useState(0);
  const [extraOneTimeMonth, setExtraOneTimeMonth] = useState(12);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  function calculate(overridePrincipal = principal) {
    setLoading(true);
    api
      .post<Result>("/calculators/amortization", {
        principal: overridePrincipal,
        annual_rate: annualRate,
        term_years: termYears,
        extra_monthly: extraMonthly,
        extra_monthly_start_month: extraMonthlyStartMonth,
        extra_yearly: extraYearly,
        extra_yearly_start_month: extraYearlyStartMonth,
        extra_one_time: extraOneTime,
        extra_one_time_month: extraOneTimeMonth,
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

  const schedule = (result?.yearly_schedule ?? []).map((s) => ({ year: s.year, balance: Number(s.balance) }));

  const inputs = (
    <>
      <CalcFieldGrid>
        <NumField label="Loan Amount" prefix="$" value={principal} onChange={setPrincipal} />
        <NumField label="Loan Term (Years)" value={termYears} onChange={setTermYears} />
        <NumField label="Interest Rate" percent value={annualRate} onChange={setAnnualRate} />
      </CalcFieldGrid>
      <div className="flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-wide text-nw-muted">Optional Extra Payments</div>
        <CalcFieldGrid>
          <NumField
            label="Extra Monthly"
            prefix="$"
            value={extraMonthly}
            onChange={setExtraMonthly}
            helper="Applied to every payment from the start month onward."
          />
          <NumField label="Extra Monthly Start (Month #)" value={extraMonthlyStartMonth} onChange={setExtraMonthlyStartMonth} />
        </CalcFieldGrid>
        <CalcFieldGrid>
          <NumField
            label="Extra Yearly"
            prefix="$"
            value={extraYearly}
            onChange={setExtraYearly}
            helper="Applied once a year, e.g. a tax refund or bonus."
          />
          <NumField label="Extra Yearly Start (Month #)" value={extraYearlyStartMonth} onChange={setExtraYearlyStartMonth} />
        </CalcFieldGrid>
        <CalcFieldGrid>
          <NumField label="Extra One-Time" prefix="$" value={extraOneTime} onChange={setExtraOneTime} />
          <NumField label="Extra One-Time Month #" value={extraOneTimeMonth} onChange={setExtraOneTimeMonth} />
        </CalcFieldGrid>
      </div>
      <div className="flex flex-col gap-2 pt-1">
        <CalcButton onClick={() => calculate()} loading={loading} />
        <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>
      </div>
      <p className="text-[10px] text-nw-muted">Prefilled from your mortgage account, if you have one — but works for any loan.</p>
    </>
  );

  const results =
    result === null ? (
      <CalcEmptyState />
    ) : (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Monthly Payment" value={fmtMoney(result.monthly_payment)} />
          <ResultTile
            label="Payoff Time"
            value={result.months_to_payoff != null ? `${result.months_to_payoff} mo (${result.years_to_payoff} yr)` : "—"}
          />
          <ResultTile label="Total Interest" value={fmtMoney(result.total_interest)} />
          <ResultTile label="Interest Saved" value={fmtMoney(result.interest_saved)} />
          <ResultTile label="Time Saved" value={result.months_saved != null ? `${result.months_saved} mo` : "—"} />
        </div>
        <YearlyBalanceChart data={schedule} />
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="Amortization Calculator"
        description="See exactly how each payment splits between principal and interest — and how much time and interest an extra monthly, yearly, or one-time payment could save you."
      />
      <CalcLayout inputs={inputs} results={results} />
    </div>
  );
}
