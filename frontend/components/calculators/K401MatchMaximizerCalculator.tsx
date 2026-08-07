"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { NumField, ResultTile, fmtMoney, CalcButton, CalcCopy, CalcLayout, CalcRow, CalcCol, CalcAnswer, CalcEmptyState } from "@/components/calculators/shared";

const SCALE_MAX = 20; // % — a wide-enough window to fit any realistic match/IRS-limit combo

function MatchWindowBar({ minPct, maxPct, irsLimitPct }: { minPct: number; maxPct: number; irsLimitPct: number }) {
  const clamp = (v: number) => Math.max(0, Math.min(100, (v / SCALE_MAX) * 100));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-3 rounded-full bg-nw-track overflow-hidden">
        <div
          className="absolute h-full bg-nw-green-tint border-x border-nw-green-line"
          style={{ left: `${clamp(minPct)}%`, width: `${Math.max(0, clamp(maxPct) - clamp(minPct))}%` }}
        />
        <div className="absolute h-full w-0.5 bg-nw-amber" style={{ left: `${clamp(irsLimitPct)}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-nw-muted">
        <span>0%</span>
        <span>{SCALE_MAX}%</span>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-nw-green-tint border border-nw-green-line flex-none" /> Safe contribution window
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-0.5 bg-nw-amber flex-none" /> IRS annual limit (est.)
        </span>
      </div>
    </div>
  );
}

export function K401MatchMaximizerCalculator() {
  const [inputs, setInputs] = useState({
    current_age: 35,
    annual_income: 80000,
    employer_match_1_pct: 1.0,
    employer_match_1_limit_pct: 0.03,
    employer_match_2_pct: 0.5,
    employer_match_2_limit_pct: 0.02,
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  function calculate() {
    setLoading(true);
    api
      .post<Record<string, unknown>>("/calculators/401k-match-maximizer", inputs)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }

  const inputsPanel = (
    <>
      <CalcRow>
        <CalcCol><NumField label="Current Age" value={inputs.current_age} onChange={(v) => setInputs((i) => ({ ...i, current_age: v }))} /></CalcCol>
        <CalcCol><NumField label="Annual Income" prefix="$" value={inputs.annual_income} onChange={(v) => setInputs((i) => ({ ...i, annual_income: v }))} /></CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField
            label="Employer Match 1"
            percent
            value={inputs.employer_match_1_pct}
            onChange={(v) => setInputs((i) => ({ ...i, employer_match_1_pct: v }))}
            helper="e.g. 100% for a dollar-for-dollar match on tier 1."
          />
        </CalcCol>
        <CalcCol>
          <NumField
            label="Limit"
            percent
            value={inputs.employer_match_1_limit_pct}
            onChange={(v) => setInputs((i) => ({ ...i, employer_match_1_limit_pct: v }))}
          />
        </CalcCol>
      </CalcRow>
      <CalcRow>
        <CalcCol>
          <NumField
            label="Employer Match 2"
            percent
            value={inputs.employer_match_2_pct}
            onChange={(v) => setInputs((i) => ({ ...i, employer_match_2_pct: v }))}
            helper="Second tier's match rate, if any (0 if not)."
          />
        </CalcCol>
        <CalcCol>
          <NumField
            label="Limit"
            percent
            value={inputs.employer_match_2_limit_pct}
            onChange={(v) => setInputs((i) => ({ ...i, employer_match_2_limit_pct: v }))}
            helper="Additional % beyond tier 1 that tier 2 covers."
          />
        </CalcCol>
      </CalcRow>
      <div className="pt-1">
        <CalcButton onClick={calculate} loading={loading} />
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
          Contribute between {String(result.recommended_min_pct)}% and {String(result.recommended_max_pct)}% of your salary to capture the
          full {fmtMoney(result.estimated_annual_employer_match)} employer match without risking the IRS limit cutting it off early.
        </CalcAnswer>
        <div className="flex flex-wrap gap-2">
          <ResultTile label="Minimum to Capture Full Match" value={`${result.recommended_min_pct}%`} />
          <ResultTile label="Maximum Before IRS Limit" value={`${result.recommended_max_pct}%`} />
          <ResultTile label="Estimated Annual Match" value={fmtMoney(result.estimated_annual_employer_match)} />
        </div>
        <div className="rounded-lg border border-nw-border bg-nw-surface p-4">
          <MatchWindowBar
            minPct={Number(result.recommended_min_pct)}
            maxPct={Number(result.recommended_max_pct)}
            irsLimitPct={Number(result.irs_limit_pct)}
          />
        </div>
        {!result.meets_full_match_within_irs_limit && (
          <p className="text-xs text-nw-amber">
            At this income, contributing enough to capture the full match risks hitting the IRS limit before
            year-end — consider spreading contributions evenly across all pay periods.
          </p>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <CalcCopy
        title="401(k) Match Maximizer"
        description="Contributing too little means missing free employer match money. Contributing too much, as a % of a high salary, can hit the IRS annual limit before year-end — cutting off match money too. This finds the contribution % window that captures the full match safely."
      />
      <CalcLayout inputs={inputsPanel} results={resultsPanel} />
    </div>
  );
}
