"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { NumField, ResultTile, fmtMoney, CalcButton, CalcCopy, CalcTabs, CalcLayout, CalcFieldGrid, CalcEmptyState } from "@/components/calculators/shared";
import { Button } from "@/components/ui/Button";

type RepaymentOption = "lump_sum" | "extra_payments" | "biweekly" | "normal";

const TABS: { key: RepaymentOption; label: string }[] = [
  { key: "normal", label: "Normal Repayment" },
  { key: "extra_payments", label: "Extra Payments" },
  { key: "biweekly", label: "Biweekly Repayment" },
  { key: "lump_sum", label: "Pay Off Altogether" },
];

const MODE_COPY: Record<RepaymentOption, string> = {
  normal: "Continue paying this loan exactly on its original schedule — the baseline every other option is compared against.",
  extra_payments: "Continue at the original payment, plus an extra monthly, yearly, and/or one-time payment.",
  biweekly: "Pay half the monthly payment every two weeks instead — 26 payments a year, the equivalent of 13 monthly payments.",
  lump_sum: "Pay off the remaining balance today — no more interest accrues from this point on.",
};

interface Result {
  error?: string;
  current_balance: string;
  payoff_amount_today?: string;
  months_to_payoff?: number | null;
  years_to_payoff?: string | null;
  total_interest?: string;
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

export function MortgagePayoffCalculator() {
  const [option, setOption] = useState<RepaymentOption>("normal");
  const [originalPrincipal, setOriginalPrincipal] = useState(300000);
  const [originalTermYears, setOriginalTermYears] = useState(30);
  const [annualRate, setAnnualRate] = useState(0.065);
  const [remainingTermYears, setRemainingTermYears] = useState(25);
  const [remainingTermMonths, setRemainingTermMonths] = useState(0);
  const [extraMonthly, setExtraMonthly] = useState(0);
  const [extraYearly, setExtraYearly] = useState(0);
  const [extraOneTime, setExtraOneTime] = useState(0);
  const [extraOneTimeMonth, setExtraOneTimeMonth] = useState(12);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  function calculate(overridePrincipal = originalPrincipal) {
    setLoading(true);
    api
      .post<Result>("/calculators/mortgage-payoff", {
        original_principal: overridePrincipal,
        original_term_years: originalTermYears,
        annual_rate: annualRate,
        remaining_term_years: remainingTermYears,
        remaining_term_months: remainingTermMonths,
        repayment_option: option,
        extra_monthly: extraMonthly,
        extra_yearly: extraYearly,
        extra_one_time: extraOneTime,
        extra_one_time_month: extraOneTimeMonth,
      })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

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

  const schedule = (result?.yearly_schedule ?? []).map((s) => ({ year: s.year, balance: Number(s.balance) }));

  const inputs = (
    <>
      <CalcFieldGrid>
        <NumField label="Original Loan Amount" prefix="$" value={originalPrincipal} onChange={setOriginalPrincipal} />
        <NumField label="Original Term (Years)" value={originalTermYears} onChange={setOriginalTermYears} />
        <NumField label="Interest Rate" percent value={annualRate} onChange={setAnnualRate} />
        <NumField label="Remaining Term (Years)" value={remainingTermYears} onChange={setRemainingTermYears} />
        <NumField label="Remaining Term (Extra Months)" value={remainingTermMonths} onChange={setRemainingTermMonths} />
      </CalcFieldGrid>
      {option === "extra_payments" && (
        <CalcFieldGrid>
          <NumField label="Extra Monthly" prefix="$" value={extraMonthly} onChange={setExtraMonthly} />
          <NumField label="Extra Yearly" prefix="$" value={extraYearly} onChange={setExtraYearly} />
          <NumField label="Extra One-Time" prefix="$" value={extraOneTime} onChange={setExtraOneTime} />
          <NumField label="Extra One-Time Month #" value={extraOneTimeMonth} onChange={setExtraOneTimeMonth} />
        </CalcFieldGrid>
      )}
      <div className="flex flex-col gap-2 pt-1">
        <CalcButton onClick={() => calculate()} loading={loading} />
        <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>
      </div>
      <p className="text-[10px] text-nw-muted">Prefilled from your mortgage account&apos;s current balance, if you have one.</p>
    </>
  );

  const results =
    result === null ? (
      <CalcEmptyState />
    ) : result.error ? (
      <p className="text-xs text-nw-coral">{result.error}</p>
    ) : (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Current Balance" value={fmtMoney(result.current_balance)} />
          {option === "lump_sum" ? (
            <ResultTile label="Payoff Amount Today" value={fmtMoney(result.payoff_amount_today)} />
          ) : (
            <>
              <ResultTile
                label="Payoff Time"
                value={result.months_to_payoff != null ? `${result.months_to_payoff} mo (${result.years_to_payoff} yr)` : "—"}
              />
              <ResultTile label="Total Interest" value={fmtMoney(result.total_interest)} />
            </>
          )}
          <ResultTile label="Interest Saved vs. Normal" value={fmtMoney(result.interest_saved)} />
          <ResultTile label="Time Saved vs. Normal" value={result.months_saved != null ? `${result.months_saved} mo` : "—"} />
        </div>
        <YearlyBalanceChart data={schedule} />
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy title="Mortgage Payoff Calculator" description={MODE_COPY[option]} />
      <CalcTabs tabs={TABS} active={option} onChange={switchOption} />
      <CalcLayout inputs={inputs} results={results} />
    </div>
  );
}
