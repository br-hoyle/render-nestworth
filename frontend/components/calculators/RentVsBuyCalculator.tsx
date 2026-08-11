"use client";

import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  CalcViewToggle,
  ScheduleTable,
} from "@/components/calculators/shared";

type TaxFilingStatus = "single" | "married_filing_jointly" | "head_of_household";

const TAX_FILING_OPTIONS: { value: TaxFilingStatus; label: string }[] = [
  { value: "single", label: "Single" },
  { value: "married_filing_jointly", label: "Married Filing Jointly" },
  { value: "head_of_household", label: "Head of Household" },
];

interface ScheduleRow {
  year: number;
  home_value: number;
  loan_balance: number;
  home_equity: number;
  avg_buy_cost: number;
  avg_rent_cost: number;
  year_buy_outflow: number;
  year_rent_outflow: number;
  cumulative_buy_outflow: number;
  cumulative_rent_outflow: number;
  net_sale_proceeds: number;
  investment_pot_value: number;
  buy_value: number;
  rent_value: number;
}

interface Result {
  error?: string;
  recommendation: "Renting" | "Buying";
  home_equity_at_horizon: string;
  home_value_at_horizon: string;
  avg_buy_cost_at_horizon: string;
  avg_rent_cost_at_horizon: string;
  breakeven_year: number | null;
  upfront_diff: string;
  investing_side: "rent" | "buy";
  down_payment_amount: string;
  closing_costs_amount: string;
  schedule: ScheduleRow[];
}

function ValueChart({ data }: { data: ScheduleRow[] }) {
  if (data.length < 2) return <p className="text-xs text-nw-muted">Not enough data yet.</p>;
  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid stroke="var(--nw-border)" vertical={false} />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 10, fill: "var(--nw-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--nw-border)" }}
            label={{ value: "Year", position: "insideBottom", offset: -5, fontSize: 10, fill: "var(--nw-muted)" }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--nw-muted)" }}
            tickLine={false}
            axisLine={false}
            width={70}
            tickFormatter={(v) => money(v)}
            label={{ value: "Value if Sold / Cashed Out", angle: -90, position: "insideLeft", fontSize: 10, fill: "var(--nw-muted)" }}
          />
          <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="buy_value" name="Buy (home equity, net of selling costs)" stroke="var(--nw-green)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="rent_value" name="Rent (investment pot)" stroke="var(--nw-muted)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-nw-muted pt-1">
        What each option would actually leave you holding if you stopped at that year — home equity net of what it'd cost to sell on the
        buy side, the running investment pot on the rent side. Unlike a cost figure, this doesn't net anything away, so it won't read as a
        confusing negative number the way "average cost" can.
      </p>
    </div>
  );
}

const TABLE_COLUMNS = [
  { key: "year", label: "Year" },
  { key: "home_value", label: "Home Value", format: "money" as const },
  { key: "home_equity", label: "Home Equity", format: "money" as const },
  { key: "year_buy_outflow", label: "Buy Cost (this yr)", format: "money" as const },
  { key: "cumulative_buy_outflow", label: "Buy Cost (cumulative)", format: "money" as const },
  { key: "avg_buy_cost", label: "Buy Avg $/mo", format: "money" as const },
  { key: "year_rent_outflow", label: "Rent Cost (this yr)", format: "money" as const },
  { key: "cumulative_rent_outflow", label: "Rent Cost (cumulative)", format: "money" as const },
  { key: "avg_rent_cost", label: "Rent Avg $/mo", format: "money" as const },
  { key: "investment_pot_value", label: "Investment Pot", format: "money" as const },
];

export function RentVsBuyCalculator() {
  const [comparisonYears, setComparisonYears] = useState(5);

  const [homePrice, setHomePrice] = useState(400000);
  const [downPayment, setDownPayment] = useState<AmountOrPercent>({ value: 0.2, isPercent: true });
  const [closingCosts, setClosingCosts] = useState<AmountOrPercent>({ value: 0.03, isPercent: true });
  const [loanTermYears, setLoanTermYears] = useState(30);
  const [annualRate, setAnnualRate] = useState(0.1);
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

  const [avgInvestmentReturn, setAvgInvestmentReturn] = useState(0.1);
  const [marginalFederalRate, setMarginalFederalRate] = useState(0.22);
  const [marginalStateRate, setMarginalStateRate] = useState(0.05);
  const [taxFilingStatus, setTaxFilingStatus] = useState<TaxFilingStatus>("single");

  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");

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
          {result.recommendation === "Buying" && result.breakeven_year != null
            ? `Buying is cheaper if you stay ${result.breakeven_year} years or longer. Otherwise, renting is cheaper.`
            : result.recommendation === "Renting" && result.breakeven_year == null
              ? `Renting is cheaper for the entire ${comparisonYears}-year period you're comparing.`
              : `${result.recommendation} averages cheaper over ${comparisonYears} years — ${fmtMoney(result.avg_buy_cost_at_horizon)}/mo buying vs. ${fmtMoney(result.avg_rent_cost_at_horizon)}/mo renting.`}
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Avg. Monthly Cost to Buy" value={fmtMoney(result.avg_buy_cost_at_horizon)} />
          <ResultTile label="Avg. Monthly Cost to Rent" value={fmtMoney(result.avg_rent_cost_at_horizon)} />
          <ResultTile label="Home Equity at Horizon" value={fmtMoney(result.home_equity_at_horizon)} />
          <ResultTile label="Home Value at Horizon" value={fmtMoney(result.home_value_at_horizon)} />
        </div>
        <CalcViewToggle view={view} onChange={setView} />
        {view === "chart" ? (
          <ValueChart data={schedule} />
        ) : (
          <ScheduleTable rows={schedule as unknown as Record<string, unknown>[]} columns={TABLE_COLUMNS} />
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="Rent vs. Buy Calculator"
        description="Compares buying this home against renting and investing the difference, accounting for appreciation, amortization, every recurring cost on both sides, and a simplified mortgage-interest tax benefit. The result is which option leaves you better off in today's-equivalent future dollars — not just which has the lower monthly payment."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
      <HowThisWorks result={result} />
    </div>
  );
}

function HowThisWorks({ result }: { result: Result | null }) {
  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface p-4 flex flex-col gap-3 text-sm text-nw-muted leading-relaxed">
      <h3 className="text-sm font-medium text-nw-text">How this calculator works</h3>

      <div>
        <span className="font-medium text-nw-text">Buying. </span>
        You pay a down payment and closing costs upfront. Every year after that: mortgage
        principal &amp; interest (fixed for the life of the loan), property tax, home insurance,
        PMI (only if your down payment is under 20%), HOA, and other costs — all of which except
        the mortgage payment increase over time. If your mortgage interest plus property tax
        exceeds the standard deduction for your filing status, the excess gets a tax benefit at
        your combined federal + state rate, which reduces your effective cost. Meanwhile the home
        builds equity two ways: paying down the loan balance, and appreciation. Selling at any
        point would net you the (appreciated) home value minus selling costs minus whatever's
        left on the loan — that net sale value is what's subtracted from cumulative spending to
        get the "net cost" of having owned for that long.
      </div>

      <div>
        <span className="font-medium text-nw-text">Renting. </span>
        Your cost is rent (which increases every year) plus renters insurance — nothing more.
        Renting has no equity, but buying usually requires a lot more cash upfront (down payment
        + closing costs) than renting does (security deposit + move-in cost). Whichever side needs
        less cash upfront has that leftover free to invest, and it compounds every year at your
        assumed investment return. Only the growth on that amount — not the principal, which is
        already reflected in the raw cash difference between the two paths — gets credited against
        that side's cost.
        {result && !result.error && (
          <>
            {" "}
            In this scenario, {result.investing_side === "rent" ? "renting" : "buying"} needs{" "}
            {fmtMoney(Math.abs(Number(result.upfront_diff)))} less cash upfront, so that amount is
            what's invested and compounding on the {result.investing_side === "rent" ? "rent" : "buy"}{" "}
            side above.
          </>
        )}
      </div>

      <div>
        <span className="font-medium text-nw-text">Why "average cost" can look negative. </span>
        At a long enough stay, if the equity or investment growth on a side has grown large
        enough, its netted-out "cost" can drop below zero — that's not an error, it just means
        that option has made you money net of what you spent on it, not that it's free. The Value
        view above (toggle to "Chart") sidesteps this by showing what each option actually leaves
        you holding — home equity net of selling costs on the buy side, the investment pot on the
        rent side — which doesn't net anything away, so it reads as a plain, always-sensible
        number. The table view lines up both the cost and value figures for every year, side by
        side.
      </div>

      <div>
        <span className="font-medium text-nw-text">Break-even. </span>
        The year called out in the summary above is the first year buying's average net cost
        drops to or below renting's — "buying is cheaper if you stay this long or more." Staying
        for less than that favors renting; staying longer favors buying.
      </div>

      <div>
        <span className="font-medium text-nw-text">What's simplified. </span>
        Property tax and the other recurring costs (insurance, PMI, HOA, other) increase 2%/year,
        a fixed assumption rather than a separate input for each. PMI is held flat rather than
        auto-cancelling once you cross 20% equity. Your security deposit is assumed fully
        refunded when you move out, so it's excluded from the running rent cost. There's no cap on
        the mortgage-interest deduction and no AMT, and no other itemized deductions (state income
        tax, charitable giving, etc.) are modeled.
      </div>
    </div>
  );
}
