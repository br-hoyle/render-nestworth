import type { CalculatorConfig } from "@/components/calculators/GenericCalculator";

// Every calculator has moved to a bespoke component with its own CalcRow/CalcCol layout, copy,
// and (where relevant) chart/table view toggle — this registry is kept as an empty seam for
// GenericCalculator rather than removed outright, in case a future simple field-list-in/tiles-out
// calculator doesn't warrant its own component.
export const GENERIC_CALCULATORS: Record<string, CalculatorConfig> = {};
