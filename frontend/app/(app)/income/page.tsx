"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { IncomeConflict, IncomeRecord, IncomeSummary } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Card } from "@/components/ui/Card";

function money(v: string) {
  return Number(v).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function IncomePage() {
  const [records, setRecords] = useState<IncomeRecord[] | null>(null);
  const [summary, setSummary] = useState<IncomeSummary | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const [r, s] = await Promise.all([
      api.get<IncomeRecord[]>("/income"),
      api.get<IncomeSummary>("/income/summary"),
    ]);
    setRecords(r);
    setSummary(s);
  }

  useEffect(() => {
    load();
  }, []);

  const byIndividual = (records ?? []).reduce<Record<string, IncomeRecord[]>>((acc, r) => {
    (acc[r.individual] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Income</h1>
        <Button variant="primary" onClick={() => setShowForm(true)}>
          + Add record
        </Button>
      </div>

      <Card>
        <div className="text-[10px] uppercase tracking-wide text-nw-muted">
          Household income today
        </div>
        <div className="text-xl font-medium">
          {summary ? money(summary.total_annual_income) : "—"}
          <span className="text-xs text-nw-muted"> /yr</span>
        </div>
      </Card>

      {showForm && (
        <IncomeFormCard
          onDone={() => {
            setShowForm(false);
            load();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {records?.length === 0 && (
        <p className="text-sm text-nw-muted">No income records yet.</p>
      )}

      {Object.entries(byIndividual).map(([individual, list]) => (
        <div key={individual} className="flex flex-col gap-1">
          <div className="text-[10px] uppercase tracking-wide text-nw-muted px-1">
            {individual}
          </div>
          {list.map((r) => (
            <div
              key={r.income_id}
              className={
                "flex items-center justify-between rounded-md border border-nw-border bg-nw-surface px-3 py-2 text-sm " +
                (r.is_open ? "" : "opacity-55")
              }
            >
              <div>
                <div>{r.company}</div>
                <div className="text-xs text-nw-muted">
                  {r.effective_start_date} → {r.is_open ? "open" : r.effective_end_date}
                </div>
              </div>
              <div>{money(r.income)}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function IncomeFormCard({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [individual, setIndividual] = useState("");
  const [company, setCompany] = useState("");
  const [income, setIncome] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [conflict, setConflict] = useState<IncomeConflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/income", {
        individual,
        company,
        income: Number(income),
        effective_start_date: startDate,
      });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflict(err.body as IncomeConflict);
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function resolveAndRetry() {
    if (!conflict?.suggested_resolution_end_date) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/income/${conflict.income_id}/end`, {
        effective_end_date: conflict.suggested_resolution_end_date,
      });
      setConflict(null);
      await submit();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <TextField label="Individual" value={individual} onChange={(e) => setIndividual(e.target.value)} required />
          <TextField label="Company" value={company} onChange={(e) => setCompany(e.target.value)} required />
        </div>
        <div className="flex gap-2">
          <TextField
            label="Annual income"
            type="number"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            required
          />
          <TextField
            label="Effective start date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        {conflict && (
          <div className="rounded-md border border-[#5A3228] bg-nw-coral-tint px-3 py-2 text-xs text-nw-coral flex flex-col gap-2">
            <span>
              This overlaps {conflict.individual}&apos;s existing record ({conflict.effective_start_date} →{" "}
              {conflict.effective_end_date}).
            </span>
            {conflict.suggested_resolution_end_date && (
              <button
                type="button"
                onClick={resolveAndRetry}
                className="self-start underline"
              >
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
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
