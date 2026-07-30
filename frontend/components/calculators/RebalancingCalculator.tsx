"use client";

import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtMoney } from "./shared";

const CATEGORIES = ["Banking", "Investments", "Retirement", "Property"];

interface Result {
  total: string;
  trades: Record<string, string>;
}

export function RebalancingCalculator() {
  const [current, setCurrent] = useState<Record<string, number>>({ Banking: 0, Investments: 0, Retirement: 0, Property: 0 });
  const [target, setTarget] = useState<Record<string, number>>({ Banking: 10, Investments: 50, Retirement: 30, Property: 10 });
  const [result, setResult] = useState<Result | null>(null);

  const targetTotal = Object.values(target).reduce((a, b) => a + b, 0);

  useEffect(() => {
    const id = setTimeout(() => {
      api
        .post<Result>("/calculators/rebalancing", { current_allocation: current, target_allocation_pct: target })
        .then(setResult)
        .catch(() => setResult(null));
    }, 300);
    return () => clearTimeout(id);
  }, [current, target]);

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <p className="text-xs text-nw-muted">Optional tool — suggests trades to hit a target allocation.</p>
      <div className="grid grid-cols-[1fr_100px_100px] gap-2 items-center text-xs">
        <div />
        <div className="text-nw-muted uppercase">Current $</div>
        <div className="text-nw-muted uppercase">Target %</div>
        {CATEGORIES.map((cat) => (
          <Fragment key={cat}>
            <div>{cat}</div>
            <input
              type="number"
              value={current[cat]}
              onChange={(e) => setCurrent((c) => ({ ...c, [cat]: Number(e.target.value) }))}
              className="rounded-md border border-nw-border bg-nw-rail px-2 py-1"
            />
            <input
              type="number"
              value={target[cat]}
              onChange={(e) => setTarget((t) => ({ ...t, [cat]: Number(e.target.value) }))}
              className="rounded-md border border-nw-border bg-nw-rail px-2 py-1"
            />
          </Fragment>
        ))}
      </div>
      {targetTotal !== 100 && <p className="text-xs text-nw-amber">Target percentages sum to {targetTotal}%, not 100%.</p>}

      {result && (
        <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-1">
          <div className="text-sm font-medium mb-1">Suggested trades</div>
          {Object.entries(result.trades).map(([cat, amount]) => (
            <div key={cat} className="flex justify-between text-sm">
              <span>{cat}</span>
              <span className={Number(amount) >= 0 ? "text-nw-green" : "text-nw-coral"}>
                {Number(amount) >= 0 ? "Buy " : "Sell "}
                {fmtMoney(Math.abs(Number(amount)))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
