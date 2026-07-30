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

const CALCULATORS = [
  { key: "compound-growth", label: "Compound growth", Component: CompoundGrowthCalculator, optional: false },
  { key: "debt-payoff", label: "Debt payoff", Component: DebtPayoffCalculator, optional: false },
  { key: "emergency-fund", label: "Emergency fund", Component: EmergencyFundCalculator, optional: false },
  { key: "mortgage", label: "Mortgage / amortization", Component: MortgageCalculator, optional: false },
  { key: "house-affordability", label: "House affordability", Component: HouseAffordabilityCalculator, optional: false },
  { key: "retirement", label: "Retirement / FI", Component: RetirementCalculator, optional: false },
  { key: "rebalancing", label: "Rebalancing", Component: RebalancingCalculator, optional: true },
] as const;

export default function CalculatorsPage() {
  const [active, setActive] = useState<(typeof CALCULATORS)[number]["key"]>("mortgage");
  const current = CALCULATORS.find((c) => c.key === active)!;
  const Active = current.Component;

  return (
    <div className="flex flex-col md:flex-row min-h-0">
      <div className="w-full md:w-52 flex-none flex md:flex-col gap-1 overflow-auto p-3 border-b md:border-b-0 md:border-r border-nw-border bg-nw-rail">
        {CALCULATORS.map((c) => (
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
      <div className="flex-1 p-4 md:p-6 min-w-0">
        <h1 className="text-lg font-medium mb-4">{current.label}</h1>
        <Active />
      </div>
    </div>
  );
}
