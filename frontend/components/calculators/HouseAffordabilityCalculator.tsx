"use client";

import { useState } from "react";
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
  CalcFieldGrid,
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
  "income-to-debt": "Estimate an affordable home price from your income, other debts, and a debt-to-income ratio.",
  "fixed-budget": "Estimate an affordable home price from a fixed total monthly housing budget instead — no income needed.",
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
  monthly_escrow: string;
  monthly_piti: string;
  monthly_maintenance?: string;
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
  const [maintenanceMonthly, setMaintenanceMonthly] = useState(100);

  const [termYears, setTermYears] = useState(30);
  const [annualRate, setAnnualRate] = useState(0.065);
  const [downPayment, setDownPayment] = useState<AmountOrPercent>({ value: 0.2, isPercent: true });
  const [propertyTax, setPropertyTax] = useState<AmountOrPercent>({ value: 0.012, isPercent: true });
  const [hoa, setHoa] = useState<AmountOrPercent>({ value: 0, isPercent: false });
  const [insurance, setInsurance] = useState<AmountOrPercent>({ value: 0.005, isPercent: true });

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
        hoa_value: hoa.value,
        hoa_is_percent: hoa.isPercent,
        insurance_value: insurance.value,
        insurance_is_percent: insurance.isPercent,
        dti_preset: dtiPreset,
        custom_back_end_ratio: customBackEndRatio,
        maintenance_monthly: maintenanceMonthly,
      })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

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

  const sharedFields = (
    <CalcFieldGrid>
      <NumField label="Loan Term (Years)" value={termYears} onChange={setTermYears} />
      <NumField label="Interest Rate" percent value={annualRate} onChange={setAnnualRate} />
      <AmountOrPercentField label="Down Payment" value={downPayment} onChange={setDownPayment} />
      <AmountOrPercentField label="Property Tax (per year)" value={propertyTax} onChange={setPropertyTax} />
      <AmountOrPercentField label="HOA (per year)" value={hoa} onChange={setHoa} />
      <AmountOrPercentField label="Insurance (per year)" value={insurance} onChange={setInsurance} />
    </CalcFieldGrid>
  );

  const inputs = (
    <>
      {mode === "income-to-debt" ? (
        <CalcFieldGrid>
          <NumField label="Annual Income" prefix="$" value={annualIncome} onChange={setAnnualIncome} />
          <NumField label="Monthly Debt Payback" prefix="$" value={monthlyDebts} onChange={setMonthlyDebts} />
          <SelectField label="Debt-to-Income Ratio" value={dtiPreset} onChange={setDtiPreset} options={DTI_OPTIONS} />
          {dtiPreset === "custom" && (
            <NumField label="Custom Back-End Ratio" percent value={customBackEndRatio} onChange={setCustomBackEndRatio} />
          )}
        </CalcFieldGrid>
      ) : (
        <CalcFieldGrid>
          <NumField label="Monthly Budget for House" prefix="$" value={monthlyBudget} onChange={setMonthlyBudget} />
          <NumField label="Maintenance ($/month)" prefix="$" value={maintenanceMonthly} onChange={setMaintenanceMonthly} />
        </CalcFieldGrid>
      )}
      {sharedFields}
      <div className="flex flex-col gap-2 pt-1">
        <CalcButton onClick={() => calculate()} loading={loading} />
        {mode === "income-to-debt" && <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>}
      </div>
    </>
  );

  const results =
    result === null ? (
      <CalcEmptyState />
    ) : (
      <div className="flex flex-wrap gap-2">
        <ResultTile label="Max Home Price" value={fmtMoney(result.max_price)} />
        <ResultTile label="Loan Amount" value={fmtMoney(result.loan_amount)} />
        <ResultTile label="Down Payment" value={fmtMoney(result.down_payment_amount)} />
        <ResultTile label="Monthly P&I" value={fmtMoney(result.monthly_pi)} />
        <ResultTile label="Monthly Escrow" value={fmtMoney(result.monthly_escrow)} />
        {result.monthly_maintenance != null && <ResultTile label="Monthly Maintenance" value={fmtMoney(result.monthly_maintenance)} />}
        <ResultTile label="Total Monthly (PITI)" value={fmtMoney(result.monthly_piti)} />
        {result.front_end_dti != null && <ResultTile label="Front-End DTI" value={`${result.front_end_dti}%`} />}
        {result.back_end_dti != null && <ResultTile label="Back-End DTI" value={`${result.back_end_dti}%`} />}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy title="House Affordability Calculator" description={MODE_COPY[mode]} />
      <CalcTabs tabs={TABS} active={mode} onChange={switchMode} />
      <CalcLayout inputs={inputs} results={results} />
    </div>
  );
}
