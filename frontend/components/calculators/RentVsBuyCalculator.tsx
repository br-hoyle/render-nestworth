"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import {
  AmountOrPercentField,
  AmountOrPercent,
  NumField,
  SelectField,
  ResultTile,
  fmtMoney,
  CalcButton,
  CalcCopy,
  CalcLayout,
  CalcFieldGrid,
  CalcEmptyState,
} from "@/components/calculators/shared";

type TaxFilingStatus = "single" | "married_filing_jointly" | "head_of_household";

const TAX_FILING_OPTIONS: { value: TaxFilingStatus; label: string }[] = [
  { value: "single", label: "Single" },
  { value: "married_filing_jointly", label: "Married Filing Jointly" },
  { value: "head_of_household", label: "Head of Household" },
];

interface Result {
  error?: string;
  advantage_of_renting: string;
  recommendation: "Renting" | "Buying";
  home_equity_at_horizon: string;
  home_value_at_horizon: string;
  breakeven_year: number | null;
  schedule: { year: number; advantage_of_renting: number }[];
}

function AdvantageChart({ data }: { data: { year: number; advantage_of_renting: number }[] }) {
  if (data.length < 2) return <p className="text-xs text-nw-muted">Not enough data yet.</p>;
  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid stroke="var(--nw-border)" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => money(v)} />
          <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
          <ReferenceLine y={0} stroke="var(--nw-border)" />
          <Line type="monotone" dataKey="advantage_of_renting" stroke="var(--nw-green)" strokeWidth={2} dot={false} name="Advantage of renting" />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-nw-muted pt-1">
        Above zero: renting-and-investing the difference is ahead. Below zero: buying is ahead.
      </p>
    </div>
  );
}

export function RentVsBuyCalculator() {
  const [comparisonYears, setComparisonYears] = useState(10);

  const [homePrice, setHomePrice] = useState(400000);
  const [downPayment, setDownPayment] = useState<AmountOrPercent>({ value: 0.2, isPercent: true });
  const [annualRate, setAnnualRate] = useState(0.065);
  const [loanTermYears, setLoanTermYears] = useState(30);
  const [closingCostsPct, setClosingCostsPct] = useState(0.03);
  const [propertyTaxPct, setPropertyTaxPct] = useState(0.012);
  const [propertyTaxIncreasePct, setPropertyTaxIncreasePct] = useState(0.02);
  const [homeInsurancePct, setHomeInsurancePct] = useState(0.005);
  const [hoaFeesPct, setHoaFeesPct] = useState(0);
  const [maintenancePct, setMaintenancePct] = useState(0.01);
  const [homeAppreciationPct, setHomeAppreciationPct] = useState(0.03);
  const [costsIncreasePct, setCostsIncreasePct] = useState(0.02);
  const [sellingClosingCostsPct, setSellingClosingCostsPct] = useState(0.06);

  const [monthlyRent, setMonthlyRent] = useState(2000);
  const [rentalIncreasePct, setRentalIncreasePct] = useState(0.03);
  const [rentersInsuranceAnnual, setRentersInsuranceAnnual] = useState(180);
  const [securityDeposit, setSecurityDeposit] = useState(2000);
  const [rentUpfrontCost, setRentUpfrontCost] = useState(0);

  const [avgInvestmentReturn, setAvgInvestmentReturn] = useState(0.07);
  const [marginalFederalRate, setMarginalFederalRate] = useState(0.22);
  const [marginalStateRate, setMarginalStateRate] = useState(0.05);
  const [taxFilingStatus, setTaxFilingStatus] = useState<TaxFilingStatus>("single");

  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  function calculate() {
    setLoading(true);
    api
      .post<Result>("/calculators/rent-vs-buy", {
        comparison_years: comparisonYears,
        home_price: homePrice,
        down_payment_value: downPayment.value,
        down_payment_is_percent: downPayment.isPercent,
        annual_rate: annualRate,
        loan_term_years: loanTermYears,
        closing_costs_pct: closingCostsPct,
        property_tax_pct: propertyTaxPct,
        property_tax_increase_pct: propertyTaxIncreasePct,
        home_insurance_pct: homeInsurancePct,
        hoa_fees_pct: hoaFeesPct,
        maintenance_pct: maintenancePct,
        home_appreciation_pct: homeAppreciationPct,
        costs_increase_pct: costsIncreasePct,
        selling_closing_costs_pct: sellingClosingCostsPct,
        monthly_rent: monthlyRent,
        rental_increase_pct: rentalIncreasePct,
        renters_insurance_annual: rentersInsuranceAnnual,
        security_deposit: securityDeposit,
        rent_upfront_cost: rentUpfrontCost,
        avg_investment_return: avgInvestmentReturn,
        marginal_federal_rate: marginalFederalRate,
        marginal_state_rate: marginalStateRate,
        tax_filing_status: taxFilingStatus,
      })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  const schedule = (result?.schedule ?? []).map((s) => ({ year: s.year, advantage_of_renting: Number(s.advantage_of_renting) }));
  const advantage = result ? Number(result.advantage_of_renting) : 0;

  const inputs = (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-wide text-nw-muted">Home Purchase</div>
        <CalcFieldGrid>
          <NumField label="Home Price" prefix="$" value={homePrice} onChange={setHomePrice} />
          <AmountOrPercentField label="Down Payment" value={downPayment} onChange={setDownPayment} />
          <NumField label="Interest Rate" percent value={annualRate} onChange={setAnnualRate} />
          <NumField label="Loan Term (Years)" value={loanTermYears} onChange={setLoanTermYears} />
          <NumField label="Closing Costs" percent value={closingCostsPct} onChange={setClosingCostsPct} />
          <NumField label="Property Tax (per year)" percent value={propertyTaxPct} onChange={setPropertyTaxPct} />
          <NumField label="Property Tax Increase" percent value={propertyTaxIncreasePct} onChange={setPropertyTaxIncreasePct} />
          <NumField label="Home Insurance (per year)" percent value={homeInsurancePct} onChange={setHomeInsurancePct} />
          <NumField label="HOA Fees (per year)" percent value={hoaFeesPct} onChange={setHoaFeesPct} />
          <NumField label="Maintenance (per year)" percent value={maintenancePct} onChange={setMaintenancePct} />
          <NumField label="Home Value Appreciation" percent value={homeAppreciationPct} onChange={setHomeAppreciationPct} />
          <NumField label="Costs/Insurance Increase" percent value={costsIncreasePct} onChange={setCostsIncreasePct} />
          <NumField label="Selling Closing Costs" percent value={sellingClosingCostsPct} onChange={setSellingClosingCostsPct} />
        </CalcFieldGrid>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-wide text-nw-muted">Home Rent</div>
        <CalcFieldGrid>
          <NumField label="Monthly Rental Fee" prefix="$" value={monthlyRent} onChange={setMonthlyRent} />
          <NumField label="Rental Fee Increase (per year)" percent value={rentalIncreasePct} onChange={setRentalIncreasePct} />
          <NumField label="Renters Insurance (per year)" prefix="$" value={rentersInsuranceAnnual} onChange={setRentersInsuranceAnnual} />
          <NumField label="Security Deposit" prefix="$" value={securityDeposit} onChange={setSecurityDeposit} />
          <NumField label="Upfront Cost" prefix="$" value={rentUpfrontCost} onChange={setRentUpfrontCost} />
        </CalcFieldGrid>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-wide text-nw-muted">Your Information</div>
        <CalcFieldGrid>
          <NumField label="Years to Compare" value={comparisonYears} onChange={setComparisonYears} />
          <NumField label="Average Investment Return" percent value={avgInvestmentReturn} onChange={setAvgInvestmentReturn} />
          <NumField label="Marginal Federal Tax Rate" percent value={marginalFederalRate} onChange={setMarginalFederalRate} />
          <NumField label="Marginal State Tax Rate" percent value={marginalStateRate} onChange={setMarginalStateRate} />
          <div className="sm:col-span-2 xl:col-span-3">
            <SelectField label="Tax Filing Status" value={taxFilingStatus} onChange={setTaxFilingStatus} options={TAX_FILING_OPTIONS} />
          </div>
        </CalcFieldGrid>
      </div>
      <div className="pt-1">
        <CalcButton onClick={calculate} loading={loading} />
      </div>
    </>
  );

  const results =
    result === null ? (
      <CalcEmptyState />
    ) : result.error ? (
      <p className="text-xs text-nw-coral">{result.error}</p>
    ) : (
      <div className="flex flex-col gap-3">
        <div
          className={
            "rounded-lg border p-3 text-sm font-medium " +
            (result.recommendation === "Renting" ? "border-nw-green-line bg-nw-green-tint text-nw-mint" : "border-nw-border bg-nw-surface")
          }
        >
          {result.recommendation} wins by {fmtMoney(Math.abs(advantage))} over {comparisonYears} years
          {result.breakeven_year != null && ` (crosses over in year ${result.breakeven_year})`}.
        </div>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Home Equity at Horizon" value={fmtMoney(result.home_equity_at_horizon)} />
          <ResultTile label="Home Value at Horizon" value={fmtMoney(result.home_value_at_horizon)} />
        </div>
        <AdvantageChart data={schedule} />
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="Rent vs. Buy Calculator"
        description="Compares buying this home against renting and investing the difference, accounting for appreciation, amortization, every recurring cost on both sides, and a simplified mortgage-interest tax benefit. The result is which option leaves you better off in today's-equivalent future dollars — not just which has the lower monthly payment."
      />
      <CalcLayout inputs={inputs} results={results} />
    </div>
  );
}
