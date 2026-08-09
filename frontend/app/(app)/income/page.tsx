"use client";

import { useEffect, useState } from "react";
import { ComposedChart, Bar, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, ApiError } from "@/lib/api";
import type { IncomeConflict, IncomeRecord, IncomeSeriesResponse, IncomeSummary } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Card } from "@/components/ui/Card";
import { titleCase } from "@/lib/format";
import { LoadingBlock } from "@/components/ui/Spinner";

function money(v: string | number) {
  return Number(v).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function IncomePage() {
  const [records, setRecords] = useState<IncomeRecord[] | null>(null);
  const [summary, setSummary] = useState<IncomeSummary | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [series, setSeries] = useState<IncomeSeriesResponse | null>(null);

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
    api.get<IncomeSeriesResponse>("/income/series?months=24").then(setSeries);
  }, []);

  const seriesData = (series?.points ?? []).map((p) => ({
    month: p.date.slice(0, 7),
    gross: Number(p.gross_monthly),
    net: p.net_monthly !== null ? Number(p.net_monthly) : null,
    diff_pct: p.diff_pct,
  }));
  const latestPoint = series?.points[series.points.length - 1];

  const visibleRecords = (records ?? []).filter((r) => filter === "all" || r.is_open);
  const byIndividual = visibleRecords.reduce<Record<string, IncomeRecord[]>>((acc, r) => {
    (acc[r.individual] ??= []).push(r);
    return acc;
  }, {});

  if (records === null || summary === null || series === null) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-3 max-w-3xl mx-auto w-full">
        <h1 className="text-lg font-medium">Income</h1>
        <LoadingBlock />
      </div>
    );
  }

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
          {money(summary.total_annual_income)}
          <span className="text-sm text-nw-muted"> /yr</span>
        </div>
      </div>

      <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-sm font-medium">Gross vs. Net Income</div>
            <p className="text-[10px] text-nw-muted">
              Gross = effective-dated income records below. Net = actual income-type transactions.
            </p>
          </div>
          {seriesData.length > 1 && latestPoint && (
            <div className="flex gap-3 text-right">
              <div>
                <div className="text-[10px] uppercase text-nw-muted">Gross</div>
                <div className="text-sm">{money(latestPoint.gross_monthly)}/mo</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-nw-muted">Net</div>
                <div className="text-sm">{latestPoint.net_monthly !== null ? `${money(latestPoint.net_monthly)}/mo` : "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-nw-muted">Diff</div>
                <div className={"text-sm " + (latestPoint.diff_pct !== null && latestPoint.diff_pct <= 0 ? "text-nw-green" : "text-nw-coral")}>
                  {latestPoint.diff_dollar !== null ? money(latestPoint.diff_dollar) : "—"}
                  {latestPoint.diff_pct !== null && ` (${latestPoint.diff_pct >= 0 ? "+" : ""}${latestPoint.diff_pct.toFixed(0)}%)`}
                </div>
              </div>
            </div>
          )}
        </div>
        {seriesData.length > 1 ? (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={seriesData}>
                <CartesianGrid stroke="var(--nw-border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: "var(--nw-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                  tickFormatter={(v) => money(v)}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: "var(--nw-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }}
                  itemStyle={{ color: "var(--nw-text)" }}
                  labelStyle={{ color: "var(--nw-text)" }}
                  formatter={(value, name) => (name === "Diff %" ? [`${Number(value).toFixed(0)}%`, name] : [money(Number(value)), name])}
                />
                <Bar yAxisId="left" dataKey="gross" name="Gross" fill="var(--nw-green-line)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Bar yAxisId="left" dataKey="net" name="Net" fill="var(--nw-green)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="diff_pct"
                  name="Diff %"
                  stroke="var(--nw-amber)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-nw-muted">Amber line = Diff % (Gross − Net, right axis). Net shows "—" for months with no imported transactions.</p>
          </>
        ) : (
          <p className="text-xs text-nw-muted py-6 text-center">Not enough history yet.</p>
        )}
      </div>

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
