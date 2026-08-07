"use client";

import { useState } from "react";
import { api } from "@/lib/api";
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
  CalcEmptyState,
  DebtTable,
  type DebtTableRow,
} from "@/components/calculators/shared";
import { Button } from "@/components/ui/Button";

const EMPTY_DEBT: DebtTableRow = { name: "", balance: 5000, annual_rate: 0.18, payment: 150 };

export function DebtConsolidationCalculator() {
  const [debts, setDebts] = useState<DebtTableRow[]>([{ ...EMPTY_DEBT }]);
  const [newRate, setNewRate] = useState(0.1);
  const [newTermYears, setNewTermYears] = useState(5);
  const [loanFee, setLoanFee] = useState(0);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  function calculate(debtsOverride = debts) {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/debt-consolidation", {
        debts: debtsOverride.map((d) => ({ balance: d.balance, annual_rate: d.annual_rate, monthly_payment: d.payment })),
        new_rate: newRate,
        new_term_years: newTermYears,
        loan_origination_fee: loanFee,
      })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  async function resetToMyNumbers() {
    const defaults = await api.get<{ debts?: { name: string; balance: string; annual_rate: string; minimum_payment: string }[] }>(
      "/calculators/debt-consolidation/defaults"
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

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol>
          <NumField label="New Interest Rate" percent value={newRate} onChange={setNewRate} />
        </CalcCol>
        <CalcCol>
          <NumField label="New Term (Years)" value={newTermYears} onChange={setNewTermYears} />
        </CalcCol>
        <CalcCol>
          <NumField label="Loan Fee" prefix="$" value={loanFee} onChange={setLoanFee} />
        </CalcCol>
      </CalcRow>
      <DebtTable rows={debts} onChange={setDebts} paymentLabel="Minimum Monthly Payment" />
      <div className="flex flex-col gap-2 pt-1">
        <CalcButton onClick={() => calculate()} loading={loading} />
        <Button onClick={resetToMyNumbers}>Reset to my numbers</Button>
      </div>
      <p className="text-[10px] text-nw-muted">
        Prefilled from your open, non-mortgage liability accounts, if you have any — interest rate and payment aren&apos;t tracked there, so
        fill those in.
      </p>
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
          {Number(result.monthly_savings) > 0
            ? `Consolidating saves ${fmtMoney(result.monthly_savings)}/mo — a new payment of ${fmtMoney(result.new_monthly_payment)} vs. ${fmtMoney(result.current_total_monthly_payment)} today.`
            : `Consolidating costs an extra ${fmtMoney(Math.abs(Number(result.monthly_savings)))}/mo — a new payment of ${fmtMoney(result.new_monthly_payment)} vs. ${fmtMoney(result.current_total_monthly_payment)} today.`}
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Total Balance" value={fmtMoney(result.total_balance)} />
          <ResultTile label="Blended Current Rate" value={`${Number(result.blended_current_rate_pct).toFixed(2)}%`} />
          <ResultTile label="Current Total Payment" value={fmtMoney(result.current_total_monthly_payment)} />
          <ResultTile label="New Payment" value={fmtMoney(result.new_monthly_payment)} />
          <ResultTile label="Monthly Savings" value={fmtMoney(result.monthly_savings)} />
          <ResultTile label="New Loan Total Cost (incl. fee)" value={fmtMoney(result.new_total_cost_including_fee)} />
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="Debt Consolidation Calculator"
        description="Roll several debts into one new loan at a single rate and term — compares the new blended payment (plus any origination fee) against what you're paying across all those debts today."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
