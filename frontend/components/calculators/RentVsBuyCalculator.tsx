"use client";

import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  CalcRow,
  CalcCol,
  CalcOptionalSection,
  CalcAnswer,
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
  schedule: { year: number; cumulative_buy_cost: number; cumulative_rent_cost: number }[];
}

function CostOverTimeChart({
  data,
  breakevenYear,
}: {
  data: { year: number; cumulative_buy_cost: number; cumulative_rent_cost: number }[];
  breakevenYear: number | null;
}) {
  if (data.length < 2) return <p className="text-xs text-nw-muted">Not enough data yet.</p>;
  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid stroke="var(--nw-border)" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => money(v)} />
          <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {breakevenYear != null && (
            <ReferenceLine
              x={breakevenYear}
              stroke="var(--nw-mint)"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{ value: "Payoff point", position: "insideTopLeft", fill: "var(--nw-mint)", fontSize: 10 }}
            />
          )}
          <Line type="monotone" dataKey="cumulative_buy_cost" name="Cost of owning" stroke="var(--nw-green)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="cumulative_rent_cost" name="Cost of renting" stroke="var(--nw-muted)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-nw-muted pt-1">
        Cumulative money spent under each path. Where the lines cross is the payoff point — the year buying starts costing less overall.
      </p>
    </div>
  );
}

export function RentVsBuyCalculator() {
  const [comparisonYears, setComparisonYears] = useState(5);

  const [homePrice, setHomePrice] = useState(400000);
  const [downPayment, setDownPayment] = useState<AmountOrPercent>({ value: 0.2, isPercent: true });
  const [closingCosts, setClosingCosts] = useState<AmountOrPercent>({ value: 0.03, isPercent: true });
  const [loanTermYears, setLoanTermYears] = useState(30);
  const [annualRate, setAnnualRate] = useState(0.065);
  const [homeAppreciationPct, setHomeAppreciationPct] = useState(0.03);
  const [propertyTaxPct, setPropertyTaxPct] = useState(0.012);
  const [homeInsurancePct, setHomeInsurancePct] = useState(0.005);
  const [pmiPct, setPmiPct] = useState(0.006);
  const [hoaFeesPct, setHoaFeesPct] = useState(0);
  const [otherCostsPct, setOtherCostsPct] = useState(0.01);
  const [sellingClosingCostsPct, setSellingClosingCostsPct] = useState(0.06);

  const [monthlyRent, setMonthlyRent] = useState(2000);
  const [securityDeposit, setSecurityDeposit] = useState(2000);
  const [rentUpfrontCost, setRentUpfrontCost] = useState(0);
  const [rentalIncreasePct, setRentalIncreasePct] = useState(0.03);
  const [rentersInsurance, setRentersInsurance] = useState<AmountOrPercent>({ value: 0.01, isPercent: true });

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
        closing_costs_value: closingCosts.value,
        closing_costs_is_percent: closingCosts.isPercent,
        annual_rate: annualRate,
        loan_term_years: loanTermYears,
        property_tax_pct: propertyTaxPct,
        home_insurance_pct: homeInsurancePct,
        pmi_pct: pmiPct,
        hoa_fees_pct: hoaFeesPct,
        other_costs_pct: otherCostsPct,
        home_appreciation_pct: homeAppreciationPct,
        selling_closing_costs_pct: sellingClosingCostsPct,
        monthly_rent: monthlyRent,
        security_deposit: securityDeposit,
        rent_upfront_cost: rentUpfrontCost,
        rental_increase_pct: rentalIncreasePct,
        renters_insurance_value: rentersInsurance.value,
        renters_insurance_is_percent: rentersInsurance.isPercent,
        avg_investment_return: avgInvestmentReturn,
        marginal_federal_rate: marginalFederalRate,
        marginal_state_rate: marginalStateRate,
        tax_filing_status: taxFilingStatus,
      })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  const schedule = result?.schedule ?? [];
  const advantage = result ? Number(result.advantage_of_renting) : 0;

  const inputsPanel = (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-wide text-nw-muted">Home Purchase</div>
        <CalcRow>
          <CalcCol>
            <NumField label="Home Price" prefix="$" value={homePrice} onChange={setHomePrice} />
          </CalcCol>
          <CalcCol>
            <AmountOrPercentField label="Down Payment" value={downPayment} onChange={setDownPayment} />
          </CalcCol>
          <CalcCol>
            <AmountOrPercentField label="Closing Costs" value={closingCosts} onChange={setClosingCosts} />
          </CalcCol>
        </CalcRow>
        <CalcRow>
          <CalcCol>
            <NumField label="Term (Years)" value={loanTermYears} onChange={setLoanTermYears} />
          </CalcCol>
          <CalcCol>
            <NumField label="Interest Rate" percent value={annualRate} onChange={setAnnualRate} />
          </CalcCol>
        </CalcRow>
        <CalcOptionalSection>
          <div className="flex flex-col gap-3 max-w-xs">
            <NumField label="Home Value Appreciation" percent value={homeAppreciationPct} onChange={setHomeAppreciationPct} />
            <NumField label="Selling Closing Costs" percent value={sellingClosingCostsPct} onChange={setSellingClosingCostsPct} />
            <div className="text-[11px] uppercase tracking-wide text-nw-muted pt-1">Additional Costs</div>
            <NumField label="Property Tax" percent value={propertyTaxPct} onChange={setPropertyTaxPct} />
            <NumField label="Home Insurance" percent value={homeInsurancePct} onChange={setHomeInsurancePct} />
            <NumField label="PMI Insurance" percent value={pmiPct} onChange={setPmiPct} helper="Only applied if the down payment is under 20% of the home price." />
            <NumField label="HOA Fees" percent value={hoaFeesPct} onChange={setHoaFeesPct} />
            <NumField label="Other Costs" percent value={otherCostsPct} onChange={setOtherCostsPct} />
          </div>
        </CalcOptionalSection>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-wide text-nw-muted"><br></br>Rental</div>
        <CalcRow>
          <CalcCol>
            <NumField label="Monthly Rental" prefix="$" value={monthlyRent} onChange={setMonthlyRent} />
          </CalcCol>
          <CalcCol>
            <NumField label="Security Deposit" prefix="$" value={securityDeposit} onChange={setSecurityDeposit} />
          </CalcCol>
          <CalcCol>
            <NumField label="Upfront Cost" prefix="$" value={rentUpfrontCost} onChange={setRentUpfrontCost} />
          </CalcCol>
        </CalcRow>
        <CalcOptionalSection>
          <div className="flex flex-col gap-3 max-w-xs">
            <NumField label="Rental Fee Increase" percent value={rentalIncreasePct} onChange={setRentalIncreasePct} />
            <AmountOrPercentField label="Renters Insurance (per year)" value={rentersInsurance} onChange={setRentersInsurance} />
          </div>
        </CalcOptionalSection>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-wide text-nw-muted"><br></br>Additional Information</div>
        <CalcRow>
          <CalcCol>
            <NumField label="Years to Compare" value={comparisonYears} onChange={setComparisonYears} />
          </CalcCol>
          <CalcCol>
            <NumField label="Average Investment Return" percent value={avgInvestmentReturn} onChange={setAvgInvestmentReturn} />
          </CalcCol>
        </CalcRow>
        <CalcRow>
          <CalcCol>
            <SelectField label="Filing Status" value={taxFilingStatus} onChange={setTaxFilingStatus} options={TAX_FILING_OPTIONS} />
          </CalcCol>
          <CalcCol>
            <NumField label="Federal Taxes" percent value={marginalFederalRate} onChange={setMarginalFederalRate} />
          </CalcCol>
          <CalcCol>
            <NumField label="State Taxes" percent value={marginalStateRate} onChange={setMarginalStateRate} />
          </CalcCol>
        </CalcRow>
      </div>
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
          {result.recommendation} wins by {fmtMoney(Math.abs(advantage))} over {comparisonYears} years
          {result.breakeven_year != null && ` — the cost-of-owning line crosses below cost-of-renting in year ${result.breakeven_year}`}.
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Home Equity at Horizon" value={fmtMoney(result.home_equity_at_horizon)} />
          <ResultTile label="Home Value at Horizon" value={fmtMoney(result.home_value_at_horizon)} />
        </div>
        <CostOverTimeChart data={schedule} breakevenYear={result.breakeven_year} />
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="Rent vs. Buy Calculator"
        description="Compares buying this home against renting and investing the difference, accounting for appreciation, amortization, every recurring cost on both sides, and a simplified mortgage-interest tax benefit. The result is which option leaves you better off in today's-equivalent future dollars — not just which has the lower monthly payment."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
