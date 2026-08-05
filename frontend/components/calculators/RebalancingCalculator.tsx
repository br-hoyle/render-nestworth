"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { fmtMoney } from "./shared";

interface Row {
  id: number;
  name: string;
  current: number;
  targetPct: number;
}

interface Result {
  total: string;
  trades: Record<string, string>;
}

let nextId = 1;

function defaultRows(): Row[] {
  return [
    { id: nextId++, name: "", current: 0, targetPct: 0 },
    { id: nextId++, name: "", current: 0, targetPct: 0 },
  ];
}

export function RebalancingCalculator() {
  const [rows, setRows] = useState<Row[]>(defaultRows);
  const [result, setResult] = useState<Result | null>(null);

  const targetTotal = rows.reduce((sum, r) => sum + r.targetPct, 0);

  function updateRow(id: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, { id: nextId++, name: "", current: 0, targetPct: 0 }]);
  }

  function removeRow(id: number) {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  useEffect(() => {
    const named = rows.filter((r) => r.name.trim());
    if (named.length === 0) {
      setResult(null);
      return;
    }
    const id = setTimeout(() => {
      const current_allocation = Object.fromEntries(named.map((r) => [r.name.trim(), r.current]));
      const target_allocation_pct = Object.fromEntries(named.map((r) => [r.name.trim(), r.targetPct]));
      api
        .post<Result>("/calculators/rebalancing", { current_allocation, target_allocation_pct })
        .then(setResult)
        .catch(() => setResult(null));
    }, 300);
    return () => clearTimeout(id);
  }, [rows]);

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <p className="text-xs text-nw-muted">Optional tool — suggests trades to hit a target allocation. Add any categories you like.</p>
      <div className="grid grid-cols-[1fr_100px_100px_28px] gap-2 items-center text-xs">
        <div />
        <div className="text-nw-muted uppercase">Current $</div>
        <div className="text-nw-muted uppercase">Target %</div>
        <div />
        {rows.map((row) => (
          <FragmentRow key={row.id} row={row} onChange={(patch) => updateRow(row.id, patch)} onRemove={() => removeRow(row.id)} />
        ))}
      </div>
      <Button onClick={addRow} className="self-start">
        + Add category
      </Button>
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

function FragmentRow({
  row,
  onChange,
  onRemove,
}: {
  row: Row;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <input
        placeholder="Category name"
        value={row.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="rounded-md border border-nw-border bg-nw-rail px-2 py-1"
      />
      <input
        type="number"
        step="1"
        value={row.current}
        onChange={(e) => onChange({ current: Math.round(Number(e.target.value)) })}
        className="rounded-md border border-nw-border bg-nw-rail px-2 py-1"
      />
      <input
        type="number"
        step="1"
        value={row.targetPct}
        onChange={(e) => onChange({ targetPct: Number(e.target.value) })}
        className="rounded-md border border-nw-border bg-nw-rail px-2 py-1"
      />
      <button onClick={onRemove} className="text-nw-coral text-xs" title="Remove category">
        ✕
      </button>
    </>
  );
}
