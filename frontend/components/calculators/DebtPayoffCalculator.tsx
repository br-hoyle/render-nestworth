"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { NumField, ResultTile, fmtMoney, CalcButton, CalcCopy, CalcLayout, CalcEmptyState } from "@/components/calculators/shared";
import { Button } from "@/components/ui/Button";

interface DebtRow {
  name: string;
  balance: number;
  annual_rate: number;
  minimum_payment: number;
}

const EMPTY_DEBT: DebtRow = { name: "", balance: 5000, annual_rate: 0.2, minimum_payment: 100 };

function ScheduleChart({ data }: { data: { year: number; total_balance: number }[] }) {
  if (data.length < 2) return <p className="text-xs text-nw-muted">Not enough data yet.</p>;
  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid stroke="var(--nw-border)" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => money(v)} />
          <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
          <Line type="monotone" dataKey="total_balance" stroke="var(--nw-green)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DebtPayoffCalculator() {
  const [debts, setDebts] = useState<DebtRow[]>([{ ...EMPTY_DEBT }]);
  const [fixedTotalPayment, setFixedTotalPayment] = useState(true);
  const [extraPayment, setExtraPayment] = useState(100);
  const [extraPaymentFrequency, setExtraPaymentFrequency] = useState<"monthly" | "annually">("monthly");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  function updateDebt(index: number, patch: Partial<DebtRow>) {
    setDebts((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function calculate(debtsOverride = debts) {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/debt-payoff", {
        debts: debtsOverride,
        fixed_total_payment: fixedTotalPayment,
        extra_payment: extraPayment,
        extra_payment_frequency: extraPaymentFrequency,
      })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  async function resetToMyNumbers() {
    const defaults = await api.get<{ debts?: DebtRow[] }>("/calculators/debt-payoff/defaults");
    if (defaults.debts && defaults.debts.length > 0) {
      setDebts(defaults.debts);
      calculate(defaults.debts);
    }
  }

  const payoffOrder = (result?.payoff_order as string[]) ?? [];
  const schedule = (result?.schedule as { year: number; total_balance: number }[]) ?? [];

  const inputsPanel = (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-wide text-nw-muted">Debts</div>
        {debts.map((debt, i) => (
          <div key={i} className="rounded-md border border-nw-border p-2 flex flex-col gap-1.5">
            <input
              type="text"
              placeholder="Debt name"
              value={debt.name}
              onChange={(e) => updateDebt(i, { name: e.target.value })}
              className="rounded-md border border-nw-border bg-nw-rail px-3 py-1.5 text-sm text-nw-text placeholder:text-nw-muted"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <NumField label="Balance" prefix="$" value={debt.balance} onChange={(v) => updateDebt(i, { balance: v })} />
              <NumField label="Interest Rate" percent value={debt.annual_rate} onChange={(v) => updateDebt(i, { annual_rate: v })} />
              <div className="col-span-2">
                <NumField
                  label="Minimum Payment"
                  prefix="$"
                  value={debt.minimum_payment}
                  onChange={(v) => updateDebt(i, { minimum_payment: v })}
                />
              </div>
            </div>
            {debts.length > 1 && (
              <button onClick={() => setDebts((rows) => rows.filter((_, idx) => idx !== i))} className="text-[10px] text-nw-coral self-start">
                Remove debt
              </button>
            )}
          </div>
        ))}
        <Button onClick={() => setDebts((rows) => [...rows, { ...EMPTY_DEBT, name: "" }])}>+ Add debt</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-nw-muted">Fixed Total Payment</span>
          <select
            value={fixedTotalPayment ? "yes" : "no"}
            onChange={(e) => setFixedTotalPayment(e.target.value === "yes")}
            className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm text-nw-text"
          >
            <option value="yes">Yes — redirect freed-up payments</option>
            <option value="no">No — total outlay shrinks</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-nw-muted">Extra Payment Frequency</span>
          <select
            value={extraPaymentFrequency}
            onChange={(e) => setExtraPaymentFrequency(e.target.value as "monthly" | "annually")}
            className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm text-nw-text"
          >
            <option value="monthly">Monthly</option>
            <option value="annually">Once a year (e.g. tax refund)</option>
          </select>
        </label>
        <div className="sm:col-span-2">
          <NumField
            label="Extra Payment"
            prefix="$"
            value={extraPayment}
            onChange={setExtraPayment}
            helper="Optional — goes to the highest-priority debt first."
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <CalcButton onClick={() => calculate()} loading={loading} />
        <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>
      </div>
    </>
  );

  const resultsPanel =
    result === null ? (
      <CalcEmptyState />
    ) : result.error ? (
      <p className="text-xs text-nw-coral">{String(result.error)}</p>
    ) : (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <ResultTile
            label="Debt-Free In"
            value={result.months_to_payoff ? `${result.months_to_payoff} mo (${result.years_to_payoff} yr)` : "—"}
          />
          <ResultTile label="Total Interest" value={fmtMoney(result.total_interest)} />
        </div>
        {payoffOrder.length > 0 && (
          <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
            <div className="text-[10px] uppercase tracking-wide text-nw-muted mb-1.5">Payoff Order (Avalanche)</div>
            <ol className="flex flex-col gap-1 text-sm list-decimal list-inside">
              {payoffOrder.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ol>
          </div>
        )}
        <ScheduleChart data={schedule} />
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="Debt Payoff Calculator"
        description="Pays down your debts using the avalanche method (highest interest rate first) — the most cost-efficient order. Add every debt you're carrying, and optionally throw extra money at it each month."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
