"use client";

import { useState } from "react";
import { CalculatorNav } from "@/components/calculators/CalculatorNav";
import { LoanCalculator } from "@/components/calculators/LoanCalculator";
import { PaymentCalculator } from "@/components/calculators/PaymentCalculator";
import { RepaymentCalculator } from "@/components/calculators/RepaymentCalculator";
import { DebtPayoffCalculator } from "@/components/calculators/DebtPayoffCalculator";
import { EmergencyFundCalculator } from "@/components/calculators/EmergencyFundCalculator";
import { HouseAffordabilityCalculator } from "@/components/calculators/HouseAffordabilityCalculator";
import { MortgageCalculator } from "@/components/calculators/MortgageCalculator";
import { AmortizationCalculator } from "@/components/calculators/AmortizationCalculator";
import { MortgagePayoffCalculator } from "@/components/calculators/MortgagePayoffCalculator";
import { RefinanceCalculator } from "@/components/calculators/RefinanceCalculator";
import { RentVsBuyCalculator } from "@/components/calculators/RentVsBuyCalculator";
import { RetirementCalculator } from "@/components/calculators/RetirementCalculator";
import { InvestmentCalculator } from "@/components/calculators/InvestmentCalculator";
import { RothIraCalculator } from "@/components/calculators/RothIraCalculator";
import { K401Calculator } from "@/components/calculators/K401Calculator";
import { K401MatchMaximizerCalculator } from "@/components/calculators/K401MatchMaximizerCalculator";
import { InterestRateCalculator } from "@/components/calculators/InterestRateCalculator";
import { CompoundingRateConverter } from "@/components/calculators/CompoundingRateConverter";
import { SavingsCalculator } from "@/components/calculators/SavingsCalculator";
import { FinancialIndependenceCalculator } from "@/components/calculators/FinancialIndependenceCalculator";
import { GenericCalculator } from "@/components/calculators/GenericCalculator";
import { GENERIC_CALCULATORS } from "@/components/calculators/genericConfigs";

type Group = "Retirement & Investment" | "Debt & Payment" | "Housing & Mortgage";

type Entry = {
  key: string;
  label: string;
  group: Group;
  render: () => React.ReactNode;
  /** True for components that render their own CalcCopy title/description internally (every
   * new component + everything routed through GenericCalculator). EmergencyFundCalculator is
   * the one remaining legacy bespoke component without one, pending its own rebuild — so the
   * page still shows a plain title above it specifically. */
  hasOwnCopy?: boolean;
  /** Retirement & Investment only: which named subsection this entry belongs to in the nav's
   * mega-menu ("Retirement Calculators" vs "Investment Calculators"), and which column (1 or 2)
   * within that subsection — see CalculatorNav's GroupPanel for how these render. */
  section?: string;
  column?: number;
};

// All three sections are now fully redesigned (Retirement & Investment: Phases 1 + this layout
// pass, Debt & Payment: Phase 2, Housing & Mortgage: Phase 3) — every calculator has its own
// math, copy, and visuals via the shared Calculate-button UI kit. Emergency Fund, Target
// Emergency Fund, Simple Interest, and Financial Independence never mapped cleanly onto
// calculator.net's 3 original categories; now that all three are built out, they've found
// permanent homes instead of sitting in a temporary "pending rebuild" bucket: Financial
// Independence complements the Retirement Calculator, and the other three sit alongside
// debt/cash-management tools.
const CALCULATORS: Entry[] = [
  { key: "retirement", label: "Retirement Calculator", group: "Retirement & Investment", render: () => <RetirementCalculator />, hasOwnCopy: true, section: "Retirement Calculators", column: 1 },
  { key: "financial-independence", label: "Financial Independence Calculator", group: "Retirement & Investment", render: () => <FinancialIndependenceCalculator />, hasOwnCopy: true, section: "Retirement Calculators", column: 1 },
  { key: "roth-ira", label: "Roth IRA Calculator", group: "Retirement & Investment", render: () => <RothIraCalculator />, hasOwnCopy: true, section: "Retirement Calculators", column: 1 },
  { key: "401k", label: "401(k) Calculator", group: "Retirement & Investment", render: () => <K401Calculator />, hasOwnCopy: true, section: "Retirement Calculators", column: 2 },
  { key: "401k-match-maximizer", label: "401(k) Match Maximizer", group: "Retirement & Investment", render: () => <K401MatchMaximizerCalculator />, hasOwnCopy: true, section: "Retirement Calculators", column: 2 },

  { key: "investment", label: "Investment Calculator", group: "Retirement & Investment", render: () => <InvestmentCalculator />, hasOwnCopy: true, section: "Investment Calculators", column: 3 },
  { key: "savings", label: "Savings Calculator", group: "Retirement & Investment", render: () => <SavingsCalculator />, hasOwnCopy: true, section: "Investment Calculators", column: 3 },
  { key: "interest-rate", label: "Interest Rate Calculator", group: "Retirement & Investment", render: () => <InterestRateCalculator />, hasOwnCopy: true, section: "Investment Calculators", column: 4 },
  { key: "compound-interest", label: "Compounding Rate Converter", group: "Retirement & Investment", render: () => <CompoundingRateConverter />, hasOwnCopy: true, section: "Investment Calculators", column: 4 },

  { key: "loan", label: "Loan Calculator", group: "Debt & Payment", render: () => <LoanCalculator />, hasOwnCopy: true },
  { key: "payment", label: "Payment Calculator", group: "Debt & Payment", render: () => <PaymentCalculator />, hasOwnCopy: true },
  { key: "repayment", label: "Repayment Calculator", group: "Debt & Payment", render: () => <RepaymentCalculator />, hasOwnCopy: true },
  { key: "debt-payoff", label: "Debt Payoff Calculator", group: "Debt & Payment", render: () => <DebtPayoffCalculator />, hasOwnCopy: true },
  { key: "debt-consolidation", label: "Debt Consolidation Calculator", group: "Debt & Payment", render: () => <GenericCalculator config={GENERIC_CALCULATORS["debt-consolidation"]} />, hasOwnCopy: true },
  { key: "emergency-fund", label: "Emergency Fund Calculator", group: "Debt & Payment", render: () => <EmergencyFundCalculator /> },
  { key: "target-emergency-fund", label: "Target Emergency Fund Calculator", group: "Debt & Payment", render: () => <GenericCalculator config={GENERIC_CALCULATORS["target-emergency-fund"]} />, hasOwnCopy: true },
  { key: "simple-interest", label: "Simple Interest Calculator", group: "Debt & Payment", render: () => <GenericCalculator config={GENERIC_CALCULATORS["simple-interest"]} />, hasOwnCopy: true },

  { key: "mortgage", label: "Mortgage Calculator", group: "Housing & Mortgage", render: () => <MortgageCalculator />, hasOwnCopy: true },
  { key: "amortization", label: "Amortization Calculator", group: "Housing & Mortgage", render: () => <AmortizationCalculator />, hasOwnCopy: true },
  { key: "mortgage-payoff", label: "Mortgage Payoff Calculator", group: "Housing & Mortgage", render: () => <MortgagePayoffCalculator />, hasOwnCopy: true },
  { key: "house-affordability", label: "House Affordability Calculator", group: "Housing & Mortgage", render: () => <HouseAffordabilityCalculator />, hasOwnCopy: true },
  { key: "refinance", label: "Refinance Calculator", group: "Housing & Mortgage", render: () => <RefinanceCalculator />, hasOwnCopy: true },
  { key: "rent-vs-buy", label: "Rent vs. Buy Calculator", group: "Housing & Mortgage", render: () => <RentVsBuyCalculator />, hasOwnCopy: true },
];

const GROUPS: Group[] = ["Retirement & Investment", "Debt & Payment", "Housing & Mortgage"];

export default function CalculatorsPage() {
  const [active, setActive] = useState<string>("retirement");
  const current = CALCULATORS.find((c) => c.key === active)!;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* A mega-menu-style nav replaces both the old left sidebar and the native-<select>
          version that followed it — the sidebar's fixed width ate into the space calculators
          needed for their inputs (pushing the Calculate button below the fold on several), and
          plain <select>s read more like a form than site navigation. Hovering or clicking a
          section opens a panel of that section's calculators below the bar, closing on
          click-away, Escape, or picking one. The Retirement & Investment panel splits further
          into named, columned subsections (Retirement Calculators / Investment Calculators)
          instead of one flat alphabetical grid, since it holds the most calculators. */}
      <CalculatorNav groups={GROUPS} calculators={CALCULATORS} active={active} onSelect={setActive} />
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 md:p-6" key={active}>
        {!current.hasOwnCopy && <h1 className="text-lg font-medium mb-4">{current.label}</h1>}
        {current.render()}
      </div>
    </div>
  );
}
