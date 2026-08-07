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
  CalcOptionalSection,
  CalcAnswer,
  CalcEmptyState,
} from "@/components/calculators/shared";

interface Result {
  error?: string;
  current_remaining_months: number;
  current_remaining_years: string;
  new_loan_amount: string;
  new_payment: string;
  monthly_savings: string;
  upfront_costs: string;
  net_upfront_cost: string;
  breakeven_months: number | null;
  current_total_interest_remaining: string;
  new_total_interest: string;
  lifetime_interest_saved: string;
}

export function RefinanceCalculator() {
  const [currentBalance, setCurrentBalance] = useState(300000);
  const [currentRate, setCurrentRate] = useState(0.07);
  const [currentMonthlyPayment, setCurrentMonthlyPayment] = useState(2000);
  const [newLoanCostsFees, setNewLoanCostsFees] = useState(3000);
  const [newRate, setNewRate] = useState(0.055);
  const [newTermYears, setNewTermYears] = useState(30);
  const [newLoanPoints, setNewLoanPoints] = useState(0);
  const [cashOutAmount, setCashOutAmount] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  function calculate() {
    setLoading(true);
    api
      .post<Result>("/calculators/refinance", {
        current_balance: currentBalance,
        current_monthly_payment: currentMonthlyPayment,
        current_rate: currentRate,
        new_rate: newRate,
        new_term_years: newTermYears,
        new_loan_points: newLoanPoints,
        new_loan_costs_fees: newLoanCostsFees,
        cash_out_amount: cashOutAmount,
      })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  const inputsPanel = (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-wide text-nw-muted">Current</div>
        <CalcRow>
          <CalcCol>
            <NumField label="Balance" prefix="$" value={currentBalance} onChange={setCurrentBalance} />
          </CalcCol>
          <CalcCol>
            <NumField label="Interest Rate" percent value={currentRate} onChange={setCurrentRate} />
          </CalcCol>
          <CalcCol>
            <NumField label="Monthly Payment" prefix="$" value={currentMonthlyPayment} onChange={setCurrentMonthlyPayment} />
          </CalcCol>
        </CalcRow>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-wide text-nw-muted"><br></br>New</div>
        <CalcRow>
          <CalcCol>
            <NumField label="Loan Fees" prefix="$" value={newLoanCostsFees} onChange={setNewLoanCostsFees} />
          </CalcCol>
          <CalcCol>
            <NumField label="Interest Rate" percent value={newRate} onChange={setNewRate} />
          </CalcCol>
          <CalcCol>
            <NumField label="Term (Years)" value={newTermYears} onChange={setNewTermYears} />
          </CalcCol>
        </CalcRow>
      </div>
      <CalcOptionalSection title="Optional New Inputs">
        <div className="flex flex-col gap-3 max-w-xs">
          <NumField label="Loan Points" percent value={newLoanPoints} onChange={setNewLoanPoints} helper="1 point = 1% of the new loan amount, paid upfront." />
          <NumField label="Cash Out Amount" prefix="$" value={cashOutAmount} onChange={setCashOutAmount} helper="Added to the new loan's balance; offsets the upfront cost." />
        </div>
      </CalcOptionalSection>
      <div className="pt-1">
        <CalcButton onClick={calculate} loading={loading} />
      </div>
    </>
  );

  const resultsPanel =
    result === null ? (
      <CalcEmptyState />
    ) : result.error ? (
      <p className="text-xs text-nw-coral">{result.error}</p>
    ) : (
      <div className="flex flex-col gap-3">
        <CalcAnswer>
          {Number(result.monthly_savings) > 0
            ? `Refinancing saves ${fmtMoney(result.monthly_savings)}/mo, breaking even on the upfront costs in ${result.breakeven_months} months.`
            : `Refinancing costs an extra ${fmtMoney(Math.abs(Number(result.monthly_savings)))}/mo — this offer doesn't lower your payment.`}
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Monthly Savings" value={fmtMoney(result.monthly_savings)} />
          <ResultTile label="Breakeven" value={result.breakeven_months != null ? `${result.breakeven_months} mo` : "—"} />
          <ResultTile label="Lifetime Interest Saved" value={fmtMoney(result.lifetime_interest_saved)} />
          <ResultTile label="Net Upfront Cost" value={fmtMoney(result.net_upfront_cost)} />
        </div>
        <div className="rounded-lg border border-nw-border bg-nw-surface overflow-x-auto">
          <table className="text-xs w-full min-w-max border-collapse">
            <thead>
              <tr className="text-nw-muted text-left">
                <th className="px-3 py-2 font-normal whitespace-nowrap"></th>
                <th className="px-3 py-2 font-normal whitespace-nowrap">Current Loan</th>
                <th className="px-3 py-2 font-normal whitespace-nowrap">New Loan</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-nw-border">
                <td className="px-3 py-1.5 whitespace-nowrap text-nw-muted">Monthly Payment</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{fmtMoney(currentMonthlyPayment)}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{fmtMoney(result.new_payment)}</td>
              </tr>
              <tr className="border-t border-nw-border">
                <td className="px-3 py-1.5 whitespace-nowrap text-nw-muted">Remaining Term</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{result.current_remaining_years} yr</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{newTermYears} yr</td>
              </tr>
              <tr className="border-t border-nw-border">
                <td className="px-3 py-1.5 whitespace-nowrap text-nw-muted">Remaining Interest</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{fmtMoney(result.current_total_interest_remaining)}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{fmtMoney(result.new_total_interest)}</td>
              </tr>
              <tr className="border-t border-nw-border">
                <td className="px-3 py-1.5 whitespace-nowrap text-nw-muted">Loan Amount</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{fmtMoney(currentBalance)}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{fmtMoney(result.new_loan_amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="Refinance Calculator"
        description="Compare your current loan against a refinance offer side by side, including how long it takes the new loan's upfront costs (fees plus any points) to pay for themselves — the formula behind breakeven is upfront costs ÷ monthly savings."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
