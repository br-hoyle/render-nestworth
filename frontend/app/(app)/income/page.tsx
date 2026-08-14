"use client";

import { useEffect, useState } from "react";
import { ComposedChart, Bar, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, ApiError } from "@/lib/api";
import type { IncomeConflict, IncomeRecord, IncomeSeriesResponse, IncomeSummary } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { IncomeConflictError, IncomeForm, type IncomeFormValues } from "@/components/forms/IncomeForm";
import { titleCase, formatMonthYear } from "@/lib/format";
import { LoadingBlock } from "@/components/ui/Spinner";

function money(v: string | number) {
  return Number(v).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function IncomePage() {
  const [records, setRecords] = useState<IncomeRecord[] | null>(null);
  const [summary, setSummary] = useState<IncomeSummary | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<IncomeRecord | null>(null);
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

  async function handleUpdate(record: IncomeRecord, values: IncomeFormValues) {
    try {
      await api.patch(`/income/${record.income_id}`, {
        individual: values.individual,
        company: values.company,
        income: Number(values.income),
        effective_start_date: values.effective_start_date,
        effective_end_date: values.effective_end_date,
      });
      setEditing(null);
      await load();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Could not save changes.");
    }
  }

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
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "var(--nw-muted)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--nw-border)" }}
                  tickFormatter={formatMonthYear}
                />
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
                  labelStyle={{ color: "var(--nw-text)" }}
                  labelFormatter={(label) => formatMonthYear(String(label))}
                  formatter={(value, name) => (name === "Diff %" ? [`${Number(value).toFixed(0)}%`, name] : [money(Number(value)), name])}
                />
                {/* Fixed hex, not theme vars — these series colors shouldn't shift with light/dark mode. */}
                <Bar yAxisId="left" dataKey="gross" name="Gross" fill="#1f5230" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Bar yAxisId="left" dataKey="net" name="Net" fill="#46c063" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="diff_pct"
                  name="Diff %"
                  stroke="#e8a33d"
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

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <div className="w-full max-w-sm rounded-lg border border-nw-border bg-nw-rail p-4">
            <IncomeForm
              initial={{
                individual: editing.individual,
                company: editing.company,
                income: editing.income,
                effective_start_date: editing.effective_start_date,
                effective_end_date: editing.effective_end_date,
              }}
              submitLabel="Save changes"
              onSubmit={(values) => handleUpdate(editing, values)}
              onCancel={() => setEditing(null)}
              onClose={() => setEditing(null)}
            />
          </div>
        </Modal>
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
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{money(r.income)}</span>
                    <button
                      type="button"
                      aria-label="Edit income record"
                      onClick={() => setEditing(r)}
                      className="text-nw-muted hover:text-nw-mint text-xs"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      aria-label="Delete income record"
                      onClick={async () => {
                        if (!window.confirm("Delete this income record?")) return;
                        await api.delete(`/income/${r.income_id}`);
                        load();
                      }}
                      className="text-nw-muted hover:text-nw-coral text-xs"
                    >
                      Delete
                    </button>
                  </div>
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
  async function submit(values: IncomeFormValues) {
    try {
      await api.post("/income", {
        individual: values.individual,
        company: values.company,
        income: Number(values.income),
        effective_start_date: values.effective_start_date,
        effective_end_date: values.effective_end_date,
      });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        throw new IncomeConflictError(err.body as IncomeConflict);
      }
      throw new Error(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  async function resolveConflict(conflict: IncomeConflict) {
    await api.post(`/income/${conflict.income_id}/end`, {
      effective_end_date: conflict.suggested_resolution_end_date,
    });
  }

  return (
    <Card>
      <IncomeForm submitLabel="Save" onSubmit={submit} onResolveConflict={resolveConflict} onCancel={onCancel} />
    </Card>
  );
}
