"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  CalcAnswer,
  CalcViewToggle,
  ScheduleTable,
  CalcEmptyState,
} from "@/components/calculators/shared";
import { Button } from "@/components/ui/Button";

interface RothScheduleRow {
  year: number;
  roth_balance: number;
  taxable_balance: number;
}

export function RothIraCalculator() {
  const [inputs, setInputs] = useState({
    current_age: 30,
    retirement_age: 65,
    maximize_contributions: true,
    annual_contribution: 7000,
    avg_return: 0.1,
    marginal_tax_rate: 0.22,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");

  function calculate(overrides = inputs) {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/roth-ira", overrides)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    api.get<Record<string, unknown>>("/calculators/roth-ira/defaults").then((defaults) => {
      const { current_balance: _unused, ...rest } = defaults;
      if (Object.keys(rest).length > 0) setInputs((i) => ({ ...i, ...(rest as Partial<typeof inputs>) }));
    });
  }, []);

  async function resetToMyNumbers() {
    // Current Balance isn't a visible input here (this calculator only projects from new
    // contributions) — drop it from the defaults response rather than silently applying a
    // real balance the household never sees or can edit.
    const { current_balance: _unused, ...defaults } = await api.get<Record<string, unknown>>("/calculators/roth-ira/defaults");
    const merged = { ...inputs, ...(defaults as Partial<typeof inputs>) };
    setInputs(merged);
    calculate(merged);
  }

  const schedule = (result?.schedule as RothScheduleRow[]) ?? [];

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol><NumField label="Current Age" value={inputs.current_age} onChange={(v) => setInputs((i) => ({ ...i, current_age: v }))} /></CalcCol>
        <CalcCol><NumField label="Retirement Age" value={inputs.retirement_age} onChange={(v) => setInputs((i) => ({ ...i, retirement_age: v }))} /></CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField
            label="Annual Investment Return"
            percent
            value={inputs.avg_return}
            onChange={(v) => setInputs((i) => ({ ...i, avg_return: v }))}
            helper="10–12% is a good place to start. That’s what the S&P 500 has averaged annually over the last 30 years."
          />
        </CalcCol>
        <CalcCol>
          <NumField
            label="Marginal Tax Rate"
            percent
            value={inputs.marginal_tax_rate}
            onChange={(v) => setInputs((i) => ({ ...i, marginal_tax_rate: v }))}
            helper="Used to estimate tax drag on the taxable comparison."
          />
        </CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-nw-muted">Maximize Contributions</span>
            <select
              value={inputs.maximize_contributions ? "yes" : "no"}
              onChange={(e) => setInputs((i) => ({ ...i, maximize_contributions: e.target.value === "yes" }))}
              className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm text-nw-text"
            >
              <option value="yes">Yes — contribute the max</option>
              <option value="no">No — my own amount</option>
            </select>
          </label>
        </CalcCol>
      </CalcRow>
      {!inputs.maximize_contributions && (
        <CalcRow>
          <CalcCol>
            <NumField
              label="Annual Contribution"
              prefix="$"
              value={inputs.annual_contribution}
              onChange={(v) => setInputs((i) => ({ ...i, annual_contribution: v }))}
              helper="Capped at the modeled $7,000/yr limit."
            />
          </CalcCol>
        </CalcRow>
      )}
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
          Your Roth IRA is projected to reach {fmtMoney(result.roth_balance)} by age {inputs.retirement_age} — {fmtMoney(result.roth_advantage)}{" "}
          more than an equivalent taxable account, thanks to tax-free growth.
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Roth Balance" value={fmtMoney(result.roth_balance)} />
          <ResultTile label="Taxable Account Balance" value={fmtMoney(result.taxable_balance)} />
          <ResultTile label="Roth Advantage" value={fmtMoney(result.roth_advantage)} />
        </div>
        <CalcViewToggle view={view} onChange={setView} />
        {view === "table" ? (
          <ScheduleTable
            rows={schedule as unknown as Record<string, unknown>[]}
            columns={[
              { key: "year", label: "Year" },
              { key: "roth_balance", label: "Roth IRA", format: "money" },
              { key: "taxable_balance", label: "Taxable Account", format: "money" },
            ]}
          />
        ) : schedule.length > 1 ? (
          <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={schedule}>
                <CartesianGrid stroke="var(--nw-border)" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => money(v)} />
                <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="roth_balance" name="Roth IRA" stroke="var(--nw-mint)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="taxable_balance" name="Taxable account" stroke="var(--nw-muted)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-nw-muted">Not enough data yet.</p>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="Roth IRA Calculator"
        description="Roth contributions are made after tax, but grow and withdraw completely tax-free — this projects your Roth balance side by side with an equivalent taxable brokerage account, so you can see the tax-free-growth advantage in dollars."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
