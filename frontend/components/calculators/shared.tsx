"use client";

import { TextField } from "@/components/ui/TextField";
import { money } from "@/lib/format";

export function NumField({
  label,
  value,
  onChange,
  step,
  percent,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  /** True for rate-like fields whose underlying value is a fraction (0.065) — displays and
   * accepts a percent number (6.5) instead, converting on the way in/out. */
  percent?: boolean;
}) {
  // Round away floating-point dust (0.07 * 100 === 7.000000000000001) while still allowing
  // genuine fractional percents like 6.375.
  const displayValue = percent ? Math.round(value * 100 * 1e6) / 1e6 : Math.round(value);

  function handleChange(raw: string) {
    if (raw === "") {
      onChange(NaN);
      return;
    }
    const n = Number(raw);
    onChange(percent ? n / 100 : Math.round(n));
  }

  return (
    <TextField
      label={percent ? `${label} (%)` : label}
      type="number"
      step={percent ? "0.01" : step ?? "1"}
      value={Number.isNaN(displayValue) ? "" : displayValue}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}

export function ResultTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-nw-border bg-nw-surface p-2 flex-1 min-w-[110px]">
      <div className="text-[10px] uppercase text-nw-muted">{label}</div>
      <div className="text-base">{value}</div>
    </div>
  );
}

export function fmtMoney(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return money(Number(v));
}
