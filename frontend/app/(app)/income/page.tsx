"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, ApiError } from "@/lib/api";
import type { IncomeConflict, IncomeRecord, IncomeSummary, TransactionListResponse } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Card } from "@/components/ui/Card";
import { titleCase } from "@/lib/format";

function money(v: string | number) {
  return Number(v).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

export default function IncomePage() {
  const [records, setRecords] = useState<IncomeRecord[] | null>(null);
  const [summary, setSummary] = useState<IncomeSummary | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [incomeByMonth, setIncomeByMonth] = useState<{ month: string; amount: number }[]>([]);

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
    api.get<TransactionListResponse>(`/transactions?start=${monthsAgo(24)}&limit=1000`).then((res) => {
      const map = new Map<string, number>();
      for (const t of res.items) {
        if (t.type !== "income") continue;
        const month = t.date.slice(0, 7);
        map.set(month, (map.get(month) ?? 0) + Number(t.amount));
      }
      setIncomeByMonth([...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount })));
    });
  }, []);

  const visibleRecords = (records ?? []).filter((r) => filter === "all" || r.is_open);
  const byIndividual = visibleRecords.reduce<Record<string, IncomeRecord[]>>((acc, r) => {
    (acc[r.individual] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-medium">Income</h1>
        <Button variant="primary" onClick={() => setShowForm(true)}>
          + Add record
        </Button>
      </div>

      <div className="rounded-lg border border-nw-border bg-nw-surface p-4 flex flex-col gap-1">
        <div className="text-[10px] uppercase tracking-wide text-nw-muted">Household Income Today</div>
        <div className="text-3xl font-medium">
          {summary ? money(summary.total_annual_income) : "—"}
          <span className="text-sm text-nw-muted"> /yr</span>
        </div>
      </div>

      {incomeByMonth.length > 1 && (
        <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
          <div className="text-sm font-medium">Total Income Over Time</div>
          <p className="text-[10px] text-nw-muted -mt-1">From imported transactions, not the effective-dated records below.</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={incomeByMonth}>
              <CartesianGrid stroke="var(--nw-border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={60} tickFormatter={(v) => money(v)} />
              <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
              <Bar dataKey="amount" fill="var(--nw-green)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[10px] uppercase tracking-wide text-nw-muted">Records</div>
        <div className="flex gap-2">
          {(["active", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                "px-3 py-1 rounded-full text-xs border capitalize " +
                (filter === f ? "border-nw-green-line text-nw-mint bg-nw-green-tint" : "border-nw-border text-nw-muted")
              }
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <IncomeFormCard
          onDone={() => {
            setShowForm(false);
            load();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {visibleRecords.length === 0 && (
        <p className="text-sm text-nw-muted">No {filter === "active" ? "active " : ""}income records yet.</p>
      )}

      <div className="flex flex-col gap-4">
        {Object.entries(byIndividual).map(([individual, list]) => (
          <div key={individual} className="flex flex-col gap-1.5">
            <div className="text-[10px] uppercase tracking-wide text-nw-muted px-1">{titleCase(individual)}</div>
            <div className="flex flex-col gap-1.5">
              {list.map((r) => (
                <div
                  key={r.income_id}
                  className={
                    "flex items-center justify-between rounded-md border border-nw-border bg-nw-surface px-3 py-2.5 text-sm hover:border-nw-line-hi " +
                    (r.is_open ? "" : "opacity-55")
                  }
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{r.company}</span>
                    <span className="text-xs text-nw-muted">
                      {r.effective_start_date} → {r.is_open ? "open" : r.effective_end_date}
                    </span>
                  </div>
                  <span className="font-medium">{money(r.income)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
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
