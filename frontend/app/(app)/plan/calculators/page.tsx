"use client";

import { useState } from "react";
import clsx from "clsx";
import { CompoundGrowthCalculator } from "@/components/calculators/CompoundGrowthCalculator";
import { DebtPayoffCalculator } from "@/components/calculators/DebtPayoffCalculator";
import { EmergencyFundCalculator } from "@/components/calculators/EmergencyFundCalculator";
import { HouseAffordabilityCalculator } from "@/components/calculators/HouseAffordabilityCalculator";
import { MortgageCalculator } from "@/components/calculators/MortgageCalculator";
import { RebalancingCalculator } from "@/components/calculators/RebalancingCalculator";
import { RetirementCalculator } from "@/components/calculators/RetirementCalculator";
import { GenericCalculator } from "@/components/calculators/GenericCalculator";
import { GENERIC_CALCULATORS } from "@/components/calculators/genericConfigs";

type Entry = {
  key: string;
  label: string;
  group: "Safety" | "Housing" | "Retirement" | "Investment" | "Debt";
  optional?: boolean;
  render: () => React.ReactNode;
};

const CALCULATORS: Entry[] = [
  { key: "target-emergency-fund", label: "Target emergency fund", group: "Safety", render: () => <GenericCalculator config={GENERIC_CALCULATORS["target-emergency-fund"]} /> },
  { key: "emergency-fund", label: "Emergency fund", group: "Safety", render: () => <EmergencyFundCalculator /> },

  { key: "mortgage", label: "Mortgage / payoff", group: "Housing", render: () => <MortgageCalculator /> },
  { key: "amortization", label: "Amortization", group: "Housing", render: () => <GenericCalculator config={GENERIC_CALCULATORS.amortization} /> },
  { key: "house-affordability", label: "House affordability", group: "Housing", render: () => <HouseAffordabilityCalculator /> },
  { key: "refinance", label: "Refinance", group: "Housing", render: () => <GenericCalculator config={GENERIC_CALCULATORS.refinance} /> },

  { key: "retirement", label: "Retirement / FI drawdown", group: "Retirement", render: () => <RetirementCalculator /> },
  { key: "financial-independence", label: "Financial independence", group: "Retirement", render: () => <GenericCalculator config={GENERIC_CALCULATORS["financial-independence"]} /> },
  { key: "roth-ira", label: "Roth IRA", group: "Retirement", render: () => <GenericCalculator config={GENERIC_CALCULATORS["roth-ira"]} /> },
  { key: "ira", label: "Traditional IRA", group: "Retirement", render: () => <GenericCalculator config={GENERIC_CALCULATORS.ira} /> },

  { key: "compound-growth", label: "Compound growth", group: "Investment", render: () => <CompoundGrowthCalculator /> },
  { key: "investment", label: "Investment growth", group: "Investment", render: () => <GenericCalculator config={GENERIC_CALCULATORS.investment} /> },
  { key: "compound-interest", label: "Compound interest", group: "Investment", render: () => <GenericCalculator config={GENERIC_CALCULATORS["compound-interest"]} /> },
  { key: "savings", label: "Savings goal", group: "Investment", render: () => <GenericCalculator config={GENERIC_CALCULATORS.savings} /> },
  { key: "simple-interest", label: "Simple interest", group: "Investment", render: () => <GenericCalculator config={GENERIC_CALCULATORS["simple-interest"]} /> },
  { key: "interest-rate", label: "Interest rate solver", group: "Investment", render: () => <GenericCalculator config={GENERIC_CALCULATORS["interest-rate"]} /> },
  { key: "rebalancing", label: "Rebalancing", group: "Investment", optional: true, render: () => <RebalancingCalculator /> },

  { key: "debt-payoff", label: "Debt payoff", group: "Debt", render: () => <DebtPayoffCalculator /> },
  { key: "debt-acceleration", label: "Debt acceleration", group: "Debt", render: () => <GenericCalculator config={GENERIC_CALCULATORS["debt-acceleration"]} /> },
  { key: "debt-consolidation", label: "Debt consolidation", group: "Debt", render: () => <GenericCalculator config={GENERIC_CALCULATORS["debt-consolidation"]} /> },
  { key: "loan", label: "Loan", group: "Debt", render: () => <GenericCalculator config={GENERIC_CALCULATORS.loan} /> },
  { key: "repayment", label: "Repayment", group: "Debt", render: () => <GenericCalculator config={GENERIC_CALCULATORS.repayment} /> },
  { key: "student-loan", label: "Student loan", group: "Debt", render: () => <GenericCalculator config={GENERIC_CALCULATORS["student-loan"]} /> },
];

const GROUPS: Entry["group"][] = ["Safety", "Housing", "Retirement", "Investment", "Debt"];

export default function CalculatorsPage() {
  const [active, setActive] = useState<string>("mortgage");
  const current = CALCULATORS.find((c) => c.key === active)!;

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0">
      <div className="w-full md:w-56 flex-none flex flex-col gap-1 overflow-y-auto p-3 border-b md:border-b-0 md:border-r border-nw-border bg-nw-rail">
        {GROUPS.map((group) => (
          <div key={group} className="flex flex-col gap-0.5 mb-2">
            <div className="text-[9px] uppercase tracking-wider text-nw-muted px-2 mt-2 mb-0.5">{group}</div>
            {CALCULATORS.filter((c) => c.group === group).map((c) => (
              <button
                key={c.key}
                onClick={() => setActive(c.key)}
                className={clsx(
                  "text-left rounded-md px-2 py-1.5 text-xs whitespace-nowrap",
                  active === c.key ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted hover:text-nw-text"
                )}
              >
                {c.label}
                {c.optional && <span className="text-[9px] text-nw-muted ml-1">opt</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 md:p-6" key={active}>
        <h1 className="text-lg font-medium mb-4">{current.label}</h1>
        {current.render()}
      </div>
    </div>
  );
}
