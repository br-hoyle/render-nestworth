"use client";

import { TextField } from "@/components/ui/TextField";
import { money } from "@/lib/format";

export function NumField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
}) {
  return (
    <TextField
      label={label}
      type="number"
      step={step ?? "any"}
      value={Number.isNaN(value) ? "" : value}
      onChange={(e) => onChange(Number(e.target.value))}
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
