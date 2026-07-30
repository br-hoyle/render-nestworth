export function money(v: number | string, opts: { maximumFractionDigits?: number } = {}) {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: opts.maximumFractionDigits ?? 0,
  });
}

export function formatMetricValue(value: number | null, unit: string): string {
  if (value === null) return "—";
  switch (unit) {
    case "percent":
      return `${value.toFixed(0)}%`;
    case "months":
      return `${value.toFixed(1)} mo`;
    case "ratio":
      return `${value.toFixed(1)}x`;
    case "dollars":
      return money(value);
    default:
      return String(value);
  }
}

export const KPI_COLOR_HEX: Record<string, string> = {
  green: "var(--nw-green)",
  yellow: "var(--nw-amber)",
  red: "var(--nw-coral)",
  coral: "var(--nw-coral)",
};
