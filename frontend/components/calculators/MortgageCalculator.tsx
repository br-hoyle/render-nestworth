"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { money, formatFullDate } from "@/lib/format";
import {
  AmountOrPercentField,
  AmountOrPercent,
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

interface Result {
  loan_amount: string;
  down_payment_amount: string;
  monthly_pi: string;
  monthly_escrow: {
    property_tax: string;
    home_insurance: string;
    pmi: string;
    hoa_fees: string;
    other_costs: string;
  };
  total_monthly_payment: string;
  payoff_date: string;
  total_interest: string;
  total_paid: string;
  yearly_schedule: { year: number; principal: number; interest: number; balance: number }[];
  error?: string;
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

export function MortgageCalculator() {
  const [homePrice, setHomePrice] = useState(400000);
  const [downPayment, setDownPayment] = useState<AmountOrPercent>({ value: 0.2, isPercent: true });
  const [annualRate, setAnnualRate] = useState(0.1);
  const [termYears, setTermYears] = useState(30);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [propertyTax, setPropertyTax] = useState<AmountOrPercent>({ value: 0.012, isPercent: true });
  const [homeInsurance, setHomeInsurance] = useState<AmountOrPercent>({ value: 0.005, isPercent: true });
  const [pmi, setPmi] = useState<AmountOrPercent>({ value: 0.006, isPercent: true });
  const [hoaFees, setHoaFees] = useState<AmountOrPercent>({ value: 0, isPercent: false });
  const [otherCosts, setOtherCosts] = useState<AmountOrPercent>({ value: 0, isPercent: false });
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");

  function calculate() {
    setLoading(true);
    api
      .post<Result>("/calculators/mortgage", {
        home_price: homePrice,
        down_payment_value: downPayment.value,
        down_payment_is_percent: downPayment.isPercent,
        annual_rate: annualRate,
        term_years: termYears,
        start_date: startDate,
        property_tax_value: propertyTax.value,
        property_tax_is_percent: propertyTax.isPercent,
        home_insurance_value: homeInsurance.value,
        home_insurance_is_percent: homeInsurance.isPercent,
        pmi_value: pmi.value,
        pmi_is_percent: pmi.isPercent,
        hoa_fees_value: hoaFees.value,
        hoa_fees_is_percent: hoaFees.isPercent,
        other_costs_value: otherCosts.value,
        other_costs_is_percent: otherCosts.isPercent,
      })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  const schedule = result?.yearly_schedule ?? [];
  const chartData = schedule.map((s) => ({ year: s.year, balance: Number(s.balance) }));

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol>
          <NumField label="Home Price" prefix="$" value={homePrice} onChange={setHomePrice} />
        </CalcCol>
        <CalcCol>
          <AmountOrPercentField label="Down Payment" value={downPayment} onChange={setDownPayment} />
        </CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField label="Interest Rate" percent value={annualRate} onChange={setAnnualRate} />
        </CalcCol>
        <CalcCol>
          <TextField label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField label="Loan Term (Years)" value={termYears} onChange={setTermYears} />
        </CalcCol>
      </CalcRow>
      <CalcOptionalSection>
        <div className="flex flex-col gap-3 max-w-xs">
          <AmountOrPercentField label="Property Tax (per year)" value={propertyTax} onChange={setPropertyTax} />
          <AmountOrPercentField label="Home Insurance (per year)" value={homeInsurance} onChange={setHomeInsurance} />
          <AmountOrPercentField
            label="PMI Insurance (per year)"
            value={pmi}
            onChange={setPmi}
            helper="Only applied if the down payment is under 20% of the home price."
          />
          <AmountOrPercentField label="HOA Fees (per year)" value={hoaFees} onChange={setHoaFees} />
          <AmountOrPercentField label="Other Costs (per year)" value={otherCosts} onChange={setOtherCosts} />
        </div>
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
      <p className="text-xs text-nw-coral">{result.error}</p>
    ) : (
      <div className="flex flex-col gap-3">
        <CalcAnswer>
          This home costs {fmtMoney(result.total_monthly_payment)}/mo all-in — {fmtMoney(result.monthly_pi)} principal &amp; interest, plus
          taxes/insurance/fees — and pays off {formatFullDate(result.payoff_date)}.
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Total Payment" value={fmtMoney(result.total_monthly_payment)} />
          <ResultTile label="Principal & Interest" value={fmtMoney(result.monthly_pi)} />
          <ResultTile label="Loan Amount" value={fmtMoney(result.loan_amount)} />
          <ResultTile label="Payoff Date" value={formatFullDate(result.payoff_date)} />
          <ResultTile label="Total Interest" value={fmtMoney(result.total_interest)} />
        </div>
        <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
          <div className="text-[10px] uppercase tracking-wide text-nw-muted mb-1.5">Monthly Escrow Breakdown</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>Property tax: {fmtMoney(result.monthly_escrow.property_tax)}</span>
            <span>Home insurance: {fmtMoney(result.monthly_escrow.home_insurance)}</span>
            <span>PMI: {fmtMoney(result.monthly_escrow.pmi)}</span>
            <span>HOA: {fmtMoney(result.monthly_escrow.hoa_fees)}</span>
            <span>Other: {fmtMoney(result.monthly_escrow.other_costs)}</span>
          </div>
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
        title="Mortgage Calculator"
        description="The full monthly cost of owning this home — principal & interest, plus property tax, insurance, PMI, HOA, and any other recurring costs. Each cost can be entered as a flat yearly dollar amount or as a percentage of the home price."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
