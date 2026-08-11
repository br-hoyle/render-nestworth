"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  AmountOrPercentField,
  AmountOrPercent,
  NumField,
  SelectField,
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
  CalcEmptyState,
} from "@/components/calculators/shared";
import { Button } from "@/components/ui/Button";

type Mode = "income-to-debt" | "fixed-budget";
type DtiPreset = "conventional" | "fha" | "va" | "custom";

const TABS: { key: Mode; label: string }[] = [
  { key: "income-to-debt", label: "Income to Debt" },
  { key: "fixed-budget", label: "Fixed Monthly Budget" },
];

const MODE_COPY: Record<Mode, string> = {
  "income-to-debt":
    "Estimate an affordable home price from your income, other debts, and a debt-to-income ratio — the front-end/back-end ratio approach lenders actually use to qualify a mortgage.",
  "fixed-budget": "Estimate an affordable home price from a fixed total monthly housing budget instead — no income or debt-to-income ratio needed.",
};

const DTI_OPTIONS: { value: DtiPreset; label: string }[] = [
  { value: "conventional", label: "Conventional (28% / 36%)" },
  { value: "fha", label: "FHA (31% / 43%)" },
  { value: "va", label: "VA (41% back-end)" },
  { value: "custom", label: "Custom" },
];

interface Result {
  max_price: string;
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
  monthly_piti: string;
  front_end_dti?: string | null;
  back_end_dti?: string | null;
}

export function HouseAffordabilityCalculator() {
  const [mode, setMode] = useState<Mode>("income-to-debt");

  const [annualIncome, setAnnualIncome] = useState(120000);
  const [monthlyDebts, setMonthlyDebts] = useState(500);
  const [dtiPreset, setDtiPreset] = useState<DtiPreset>("conventional");
  const [customBackEndRatio, setCustomBackEndRatio] = useState(0.36);

  const [monthlyBudget, setMonthlyBudget] = useState(2500);

  const [termYears, setTermYears] = useState(30);
  const [annualRate, setAnnualRate] = useState(0.1);
  const [downPayment, setDownPayment] = useState<AmountOrPercent>({ value: 0.2, isPercent: true });
  const [propertyTax, setPropertyTax] = useState<AmountOrPercent>({ value: 0.012, isPercent: true });
  const [homeInsurance, setHomeInsurance] = useState<AmountOrPercent>({ value: 0.005, isPercent: true });
  const [pmi, setPmi] = useState<AmountOrPercent>({ value: 0.006, isPercent: true });
  const [hoaFees, setHoaFees] = useState<AmountOrPercent>({ value: 0, isPercent: false });
  const [otherCosts, setOtherCosts] = useState<AmountOrPercent>({ value: 0, isPercent: false });

  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  function calculate(overrideAnnualIncome = annualIncome) {
    setLoading(true);
    api
      .post<Result>("/calculators/house-affordability", {
        mode,
        annual_income: overrideAnnualIncome,
        monthly_budget: monthlyBudget,
        monthly_debts: monthlyDebts,
        term_years: termYears,
        annual_rate: annualRate,
        down_payment_value: downPayment.value,
        down_payment_is_percent: downPayment.isPercent,
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
        dti_preset: dtiPreset,
        custom_back_end_ratio: customBackEndRatio,
      })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    api.get<{ annual_income?: string }>("/calculators/house-affordability/defaults").then((defaults) => {
      if (defaults.annual_income) setAnnualIncome(Number(defaults.annual_income));
    });
  }, []);

  async function resetToMyNumbers() {
    const defaults = await api.get<{ annual_income?: string }>("/calculators/house-affordability/defaults");
    if (defaults.annual_income) {
      const income = Number(defaults.annual_income);
      setAnnualIncome(income);
      calculate(income);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setResult(null);
  }

  const optionalCostFields = (
    <CalcOptionalSection>
      <div className="flex flex-col gap-3 max-w-xs">
        <AmountOrPercentField label="Property Tax (per year)" value={propertyTax} onChange={setPropertyTax} />
        <AmountOrPercentField label="Home Insurance (per year)" value={homeInsurance} onChange={setHomeInsurance} />
        <AmountOrPercentField
          label="PMI Insurance (per year)"
          value={pmi}
          onChange={setPmi}
          helper="Only applied if the down payment is under 20% of the max price."
        />
        <AmountOrPercentField label="HOA Fees (per year)" value={hoaFees} onChange={setHoaFees} />
        <AmountOrPercentField label="Other Costs (per year)" value={otherCosts} onChange={setOtherCosts} />
      </div>
    </CalcOptionalSection>
  );

  const inputsPanel = (
    <>
      {mode === "income-to-debt" ? (
        <>
          <CalcRow>
            <CalcCol>
              <NumField label="Annual Income" prefix="$" value={annualIncome} onChange={setAnnualIncome} />
            </CalcCol>
            <CalcCol>
              <NumField label="Monthly Debt Obligations" prefix="$" value={monthlyDebts} onChange={setMonthlyDebts} />
            </CalcCol>
          </CalcRow>
          <CalcRow>
            <CalcCol>
              <SelectField label="Debt-to-Income Ratio" value={dtiPreset} onChange={setDtiPreset} options={DTI_OPTIONS} />
            </CalcCol>
            {dtiPreset === "custom" && (
              <CalcCol>
                <NumField label="Custom Back-End Ratio" percent value={customBackEndRatio} onChange={setCustomBackEndRatio} />
              </CalcCol>
            )}
          </CalcRow>
        </>
      ) : (
        <CalcRow>
          <CalcCol>
            <NumField label="Mortgage Budget" prefix="$" value={monthlyBudget} onChange={setMonthlyBudget} />
          </CalcCol>
        </CalcRow>
      )}
      <CalcRow>
        <CalcCol>
          <AmountOrPercentField label="Down Payment" value={downPayment} onChange={setDownPayment} />
        </CalcCol>
        <CalcCol>
          <NumField label="Loan Term (Years)" value={termYears} onChange={setTermYears} />
        </CalcCol>
        <CalcCol>
          <NumField label="Interest Rate" percent value={annualRate} onChange={setAnnualRate} />
        </CalcCol>
      </CalcRow>
      {optionalCostFields}
      <div className="flex flex-col gap-2 pt-1">
        <CalcButton onClick={() => calculate()} loading={loading} />
        {mode === "income-to-debt" && <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>}
      </div>
    </>
  );

  const resultsPanel =
    result === null ? (
      <CalcEmptyState />
    ) : (
      <div className="flex flex-col gap-3">
        <CalcAnswer>
          Based on these numbers, you can afford a home around {fmtMoney(result.max_price)} — a {fmtMoney(result.loan_amount)} loan at{" "}
          {fmtMoney(result.monthly_piti)}/mo (principal, interest, taxes &amp; insurance).
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Max Home Price" value={fmtMoney(result.max_price)} />
          <ResultTile label="Loan Amount" value={fmtMoney(result.loan_amount)} />
          <ResultTile label="Down Payment" value={fmtMoney(result.down_payment_amount)} />
          <ResultTile label="Monthly P&I" value={fmtMoney(result.monthly_pi)} />
          <ResultTile label="Total Monthly (PITI)" value={fmtMoney(result.monthly_piti)} />
          {result.front_end_dti != null && <ResultTile label="Front-End DTI" value={`${result.front_end_dti}%`} />}
          {result.back_end_dti != null && <ResultTile label="Back-End DTI" value={`${result.back_end_dti}%`} />}
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
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy title="House Affordability Calculator" description={MODE_COPY[mode]} />
      <CalcTabs tabs={TABS} active={mode} onChange={switchMode} />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
