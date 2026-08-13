// Fixed categorical order for multi-category charts (Category Drift, "Where the Money
// Flows") — validated (OKLCH lightness band, CVD ΔE, contrast) against both themes' chart
// surfaces per the brand guide's own chart-color example (green/blue/amber/violet + gray,
// "maximum six series"). Never cycle an arbitrary hue in past index 4 — categories beyond
// the 5th share the muted gray fallback, same as the brand guide's "Everything else" slot.
export const CHART_CATEGORY_PALETTE = [
  "var(--nw-chart-1)",
  "var(--nw-chart-2)",
  "var(--nw-chart-3)",
  "var(--nw-chart-4)",
  "var(--nw-chart-5)",
] as const;

export const CHART_OVERFLOW_COLOR = "var(--nw-muted)";

export function chartColorForIndex(index: number): string {
  return CHART_CATEGORY_PALETTE[index] ?? CHART_OVERFLOW_COLOR;
}
