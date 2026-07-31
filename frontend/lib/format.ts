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

const TITLE_CASE_MINOR_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "vs.", "via"]);

// Title Case for tile/section headings — keeps common short connector words lowercase
// (except as the first word), and leaves anything already fully uppercase (acronyms like
// "FI", "IRA", "HELOC") untouched rather than mangling it.
export function titleCase(text: string): string {
  const words = text.split(" ");
  return words
    .map((word, i) => {
      if (word === word.toUpperCase() && word.length > 1) return word; // acronym, leave as-is
      if (i > 0 && TITLE_CASE_MINOR_WORDS.has(word.toLowerCase())) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export const KPI_COLOR_HEX: Record<string, string> = {
  green: "var(--nw-green)",
  yellow: "var(--nw-amber)",
  red: "var(--nw-coral)",
  coral: "var(--nw-coral)",
};
