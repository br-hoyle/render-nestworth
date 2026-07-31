"use client";

import { useState } from "react";
import { CATEGORY_OPTIONS_BY_BALANCE_TYPE, TYPE_OPTIONS_BY_BALANCE_AND_CATEGORY } from "@/lib/constants";
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
  const initialBalanceType = initial?.balance_type ?? "asset";
  const initialCategory = initial?.category ?? CATEGORY_OPTIONS_BY_BALANCE_TYPE[initialBalanceType][0];
  const initialTypeOptions = TYPE_OPTIONS_BY_BALANCE_AND_CATEGORY[initialBalanceType]?.[initialCategory] ?? ["Other"];
  const initialType = initial?.account_type ?? initialTypeOptions[0];

  const [values, setValues] = useState<AccountFormValues>({
    account_name: initial?.account_name ?? "",
    institution_name: initial?.institution_name ?? "",
    category: initialCategory,
    account_type: initialType,
    balance_type: initialBalanceType,
    start_date: initial?.start_date ?? new Date().toISOString().slice(0, 10),
  });
  // Whether the Type dropdown should show "Other" selected with a free-text field below it —
  // true both when the user picks "Other" and when an existing account's type doesn't match
  // any of the current category's preset options (e.g. legacy data).
  const [customType, setCustomType] = useState(
    !!initial?.account_type &&
      !(TYPE_OPTIONS_BY_BALANCE_AND_CATEGORY[initialBalanceType]?.[initialCategory] ?? []).includes(initial.account_type)
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof AccountFormValues>(key: K, value: AccountFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleBalanceTypeChange(bt: "asset" | "liability") {
    const categoryOptions = CATEGORY_OPTIONS_BY_BALANCE_TYPE[bt];
    const category = categoryOptions.includes(values.category) ? values.category : categoryOptions[0];
    const typeOptions = TYPE_OPTIONS_BY_BALANCE_AND_CATEGORY[bt]?.[category] ?? ["Other"];
    setValues((v) => ({ ...v, balance_type: bt, category, account_type: typeOptions[0] }));
    setCustomType(false);
  }

  function handleCategoryChange(category: string) {
    const typeOptions = TYPE_OPTIONS_BY_BALANCE_AND_CATEGORY[values.balance_type]?.[category] ?? ["Other"];
    setValues((v) => ({ ...v, category, account_type: typeOptions[0] }));
    setCustomType(false);
  }

  function handleTypeChange(type: string) {
    if (type === "Other") {
      setCustomType(true);
      update("account_type", "");
    } else {
      setCustomType(false);
      update("account_type", type);
    }
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

  const presetCategoryOptions = CATEGORY_OPTIONS_BY_BALANCE_TYPE[values.balance_type];
  // Legacy accounts may carry a category from before the hierarchy changed — include it so
  // the select still reflects the real saved value instead of silently swapping it out.
  const categoryOptions = presetCategoryOptions.includes(values.category)
    ? presetCategoryOptions
    : [values.category, ...presetCategoryOptions];
  const typeOptions = TYPE_OPTIONS_BY_BALANCE_AND_CATEGORY[values.balance_type]?.[values.category] ?? ["Other"];

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

      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-nw-muted">Asset / liability</label>
        <div className="flex rounded-md border border-nw-border overflow-hidden">
          {(["asset", "liability"] as const).map((bt) => (
            <button
              type="button"
              key={bt}
              onClick={() => handleBalanceTypeChange(bt)}
              className={
                "flex-1 py-1.5 text-xs capitalize " +
                (values.balance_type === bt ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")
              }
            >
              {bt}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-nw-muted">Category</label>
        <select
          value={values.category}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="w-full rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm"
        >
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-nw-muted">Type</label>
        <select
          value={customType ? "Other" : values.account_type}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="w-full rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm"
        >
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {customType && (
          <TextField
            placeholder="Type your own account type"
            value={values.account_type}
            onChange={(e) => update("account_type", e.target.value)}
            required
          />
        )}
      </div>

      <TextField
        label="Institution"
        value={values.institution_name}
        onChange={(e) => update("institution_name", e.target.value)}
        required
      />
      <TextField
        label="Account name"
        value={values.account_name}
        onChange={(e) => update("account_name", e.target.value)}
        required
      />
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
