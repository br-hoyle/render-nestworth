"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import {
  NumField,
  ResultTile,
  fmtMoney,
  CalcButton,
  CalcCopy,
  CalcLayout,
  CalcRow,
  CalcCol,
  CalcOptionalSection,
  CalcAnswer,
  CalcViewToggle,
  ScheduleTable,
  CalcEmptyState,
  DebtTable,
  type DebtTableRow,
  SelectField,
} from "@/components/calculators/shared";
import { Button } from "@/components/ui/Button";

const EMPTY_DEBT: DebtTableRow = { name: "", balance: 5000, annual_rate: 0.2, payment: 100 };

function BalanceChart({ data }: { data: { year: number; total_balance: number }[] }) {
  if (data.length < 2) return <p className="text-xs text-nw-muted">Not enough data yet.</p>;
  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid stroke="var(--nw-border)" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => money(v)} />
          <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
          <Line type="monotone" dataKey="total_balance" name="Total Balance" stroke="var(--nw-green)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DebtPayoffCalculator() {
  const [debts, setDebts] = useState<DebtTableRow[]>([{ ...EMPTY_DEBT }]);
  const [fixedTotalPayment, setFixedTotalPayment] = useState(true);
  const [extraPayment, setExtraPayment] = useState(100);
  const [extraPaymentFrequency, setExtraPaymentFrequency] = useState<"monthly" | "annually">("monthly");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");

  function calculate(debtsOverride = debts) {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/debt-payoff", {
        debts: debtsOverride.map((d) => ({ name: d.name, balance: d.balance, annual_rate: d.annual_rate, minimum_payment: d.payment })),
        fixed_total_payment: fixedTotalPayment,
        extra_payment: extraPayment,
        extra_payment_frequency: extraPaymentFrequency,
      })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  async function resetToMyNumbers() {
    const defaults = await api.get<{ debts?: { name: string; balance: string; annual_rate: string; minimum_payment: string }[] }>(
      "/calculators/debt-payoff/defaults"
    );
    if (defaults.debts && defaults.debts.length > 0) {
      const rows: DebtTableRow[] = defaults.debts.map((d) => ({
        name: d.name,
        balance: Number(d.balance),
        annual_rate: Number(d.annual_rate),
        payment: Number(d.minimum_payment),
      }));
      setDebts(rows);
      calculate(rows);
    }
  }

  const payoffOrder = (result?.payoff_order as string[]) ?? [];
  const schedule = (result?.schedule as { year: number; total_balance: number }[]) ?? [];

  const inputsPanel = (
    <>
      <SelectField
        label="Fixed Total Payment"
        value={fixedTotalPayment ? "yes" : "no"}
        onChange={(v) => setFixedTotalPayment(v === "yes")}
        options={[
          { value: "yes", label: "Yes — redirect freed-up payments" },
          { value: "no", label: "No — total outlay shrinks" },
        ]}
      />
      <DebtTable rows={debts} onChange={setDebts} paymentLabel="Minimum Monthly Payment" />
      <CalcOptionalSection>
        <CalcRow>
          <CalcCol>
            <SelectField
              label="Extra Payment Frequency"
              value={extraPaymentFrequency}
              onChange={setExtraPaymentFrequency}
              options={[
                { value: "monthly", label: "Monthly" },
                { value: "annually", label: "Once a year (e.g. tax refund)" },
              ]}
            />
          </CalcCol>
          <CalcCol>
            <NumField
              label="Extra Payment Amount"
              prefix="$"
              value={extraPayment}
              onChange={setExtraPayment}
              helper="Goes to the highest-priority debt first."
            />
          </CalcCol>
        </CalcRow>
      </CalcOptionalSection>
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
        <CalcAnswer>
          {result.months_to_payoff != null
            ? `You'll be debt-free in ${result.months_to_payoff} months (${result.years_to_payoff} years), paying ${fmtMoney(result.total_interest)} in total interest.`
            : "At this pace, these debts won't be fully paid off — add an extra payment to make progress."}
        </CalcAnswer>
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
        <CalcViewToggle view={view} onChange={setView} />
        {view === "chart" ? (
          <BalanceChart data={schedule} />
        ) : (
          <ScheduleTable rows={schedule} columns={[{ key: "year", label: "Year" }, { key: "total_balance", label: "Total Balance", format: "money" }]} />
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="Debt Payoff Calculator"
        description="Pays down your debts using the avalanche method (highest interest rate first) — the most cost-efficient order. Add every debt you're carrying, and optionally throw extra money at it each month or year."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
