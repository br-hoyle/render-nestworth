"use client";

import { useState } from "react";
import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES } from "@/lib/constants";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";

export interface AccountFormValues {
  account_name: string;
  institution_name: string;
  category: string;
  account_type: string;
  balance_type: "asset" | "liability";
  start_date: string;
}

export function AccountForm({
  initial,
  startDateLabel,
  note,
  submitLabel,
  onSubmit,
  onCancel,
  onClose,
}: {
  initial?: Partial<AccountFormValues>;
  startDateLabel: string;
  note?: string;
  submitLabel: string;
  onSubmit: (values: AccountFormValues) => Promise<void>;
  onCancel: () => void;
  onClose?: () => void;
}) {
  const [values, setValues] = useState<AccountFormValues>({
    account_name: initial?.account_name ?? "",
    institution_name: initial?.institution_name ?? "",
    category: initial?.category ?? ACCOUNT_CATEGORIES[0],
    account_type: initial?.account_type ?? ACCOUNT_TYPES[0],
    balance_type: initial?.balance_type ?? "asset",
    start_date: initial?.start_date ?? new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof AccountFormValues>(key: K, value: AccountFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {onClose && (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Account</h2>
          <button type="button" onClick={onClose} className="text-nw-muted text-xs">
            ✕
          </button>
        </div>
      )}
      {note && (
        <div className="rounded-md border border-nw-green-line bg-nw-green-tint px-3 py-2 text-xs text-nw-mint">
          {note}
        </div>
      )}
      <TextField
        label="Account name"
        value={values.account_name}
        onChange={(e) => update("account_name", e.target.value)}
        required
      />
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[11px] uppercase tracking-wide text-nw-muted">Category</label>
          <select
            value={values.category}
            onChange={(e) => update("category", e.target.value)}
            className="w-full mt-1 rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm"
          >
            {ACCOUNT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-[11px] uppercase tracking-wide text-nw-muted">Type</label>
          <select
            value={values.account_type}
            onChange={(e) => update("account_type", e.target.value)}
            className="w-full mt-1 rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm"
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <TextField
        label="Institution"
        value={values.institution_name}
        onChange={(e) => update("institution_name", e.target.value)}
        required
      />
      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-nw-muted">
          Asset / liability
        </label>
        <div className="flex rounded-md border border-nw-border overflow-hidden">
          {(["asset", "liability"] as const).map((bt) => (
            <button
              type="button"
              key={bt}
              onClick={() => update("balance_type", bt)}
              className={
                "flex-1 py-1.5 text-xs capitalize " +
                (values.balance_type === bt
                  ? "bg-nw-green-tint text-nw-mint"
                  : "text-nw-muted")
              }
            >
              {bt}
            </button>
          ))}
        </div>
      </div>
      <TextField
        label={startDateLabel}
        type="date"
        value={values.start_date}
        onChange={(e) => update("start_date", e.target.value)}
        required
      />
      {error && (
        <div className="rounded-md border border-[#5A3228] bg-nw-coral-tint px-3 py-2 text-xs text-nw-coral">
          {error}
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
