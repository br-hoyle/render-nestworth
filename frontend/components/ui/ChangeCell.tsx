export function ChangeCell({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-nw-muted">—</span>;
  return (
    <span className={pct >= 0 ? "text-nw-green" : "text-nw-coral"}>
      {pct >= 0 ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}
