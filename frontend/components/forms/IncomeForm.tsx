"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import type { IncomeConflict } from "@/lib/types";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";

export interface IncomeFormValues {
  individual: string;
  company: string;
  income: string;
  effective_start_date: string;
  effective_end_date: string;
}

/** Thrown by a create-flow `onSubmit` to signal a resolvable overlap conflict — distinct
 * from a plain Error so IncomeForm knows to show the "end previous record and retry" banner
 * instead of a generic error string. Edit flows should NOT throw this; a 409 on edit surfaces
 * as a plain error like any other validation failure. */
export class IncomeConflictError extends Error {
  conflict: IncomeConflict;

  constructor(conflict: IncomeConflict) {
    super("Overlaps an existing record.");
    this.conflict = conflict;
  }
}

export function IncomeForm({
  initial,
  submitLabel,
  onSubmit,
  onResolveConflict,
  onCancel,
  onClose,
}: {
  initial?: Partial<IncomeFormValues>;
  submitLabel: string;
  onSubmit: (values: IncomeFormValues) => Promise<void>;
  onResolveConflict?: (conflict: IncomeConflict, values: IncomeFormValues) => Promise<void>;
  onCancel: () => void;
  onClose?: () => void;
}) {
  const [values, setValues] = useState<IncomeFormValues>({
    individual: initial?.individual ?? "",
    company: initial?.company ?? "",
    income: initial?.income ?? "",
    effective_start_date: initial?.effective_start_date ?? new Date().toISOString().slice(0, 10),
    effective_end_date: initial?.effective_end_date ?? "9999-12-31",
  });
  const [conflict, setConflict] = useState<IncomeConflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof IncomeFormValues>(key: K, value: IncomeFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(values);
      setConflict(null);
    } catch (err) {
      if (err instanceof IncomeConflictError) {
        setConflict(err.conflict);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function resolveAndRetry() {
    if (!conflict?.suggested_resolution_end_date || !onResolveConflict) return;
    setSubmitting(true);
    setError(null);
    try {
      await onResolveConflict(conflict, values);
      setConflict(null);
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {onClose && (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Income</h2>
          <button type="button" onClick={onClose} className="text-nw-muted text-xs">
            ✕
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <TextField label="Individual" value={values.individual} onChange={(e) => update("individual", e.target.value)} required />
        <TextField label="Company" value={values.company} onChange={(e) => update("company", e.target.value)} required />
      </div>
      <TextField
        label="Annual income"
        type="number"
        value={values.income}
        onChange={(e) => update("income", e.target.value)}
        required
      />
      <div className="flex gap-2">
        <TextField
          label="Effective start date"
          type="date"
          value={values.effective_start_date}
          onChange={(e) => update("effective_start_date", e.target.value)}
          required
        />
        <TextField
          label="Effective end date"
          type="date"
          value={values.effective_end_date}
          onChange={(e) => update("effective_end_date", e.target.value)}
          required
        />
      </div>
      {conflict && (
        <div className="rounded-md border border-[#5A3228] bg-nw-coral-tint px-3 py-2 text-xs text-nw-coral flex flex-col gap-2">
          <span>
            This overlaps {conflict.individual}&apos;s existing record ({conflict.effective_start_date} →{" "}
            {conflict.effective_end_date}).
          </span>
          {conflict.suggested_resolution_end_date && onResolveConflict && (
            <button type="button" onClick={resolveAndRetry} className="self-start underline">
              End the previous record on {conflict.suggested_resolution_end_date} and retry
            </button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-nw-coral">{error}</p>}
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
