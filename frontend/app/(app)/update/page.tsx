"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { Account, StaleAccountInfo } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { LoadingBlock } from "@/components/ui/Spinner";

function money(v: string | number) {
  return Number(v).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

interface ChangeEntry {
  account_id: string;
  account_name: string;
  before: number | null;
  after: number;
  full_date: string;
}

export default function UpdatePage() {
  const [queue, setQueue] = useState<Account[] | null>(null);
  const [staleByAccount, setStaleByAccount] = useState<Record<string, StaleAccountInfo>>({});
  const [index, setIndex] = useState(0);
  const [balance, setBalance] = useState("");
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [changes, setChanges] = useState<ChangeEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [accounts, stale] = await Promise.all([
        api.get<Account[]>("/accounts?filter=active"),
        api.get<StaleAccountInfo[]>("/accounts/stale"),
      ]);
      const staleMap: Record<string, StaleAccountInfo> = {};
      stale.forEach((s) => (staleMap[s.account_id] = s));
      setStaleByAccount(staleMap);
      // Stale accounts first, then the rest.
      const sorted = [...accounts].sort((a, b) => {
        const aStale = staleMap[a.account_id]?.is_stale ? 0 : 1;
        const bStale = staleMap[b.account_id]?.is_stale ? 0 : 1;
        return aStale - bStale;
      });
      setQueue(sorted);
    })();
  }, []);

  const current = queue?.[index];

  async function handleSaveAndNext() {
    if (!current) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/balances", {
        account_id: current.account_id,
        full_date: asOfDate,
        balance: Number(balance),
      });
      setChanges((c) => {
        const entry: ChangeEntry = {
          account_id: current.account_id,
          account_name: current.account_name,
          before: current.latest_balance ? Number(current.latest_balance) : null,
          after: Number(balance),
          full_date: asOfDate,
        };
        const existingIdx = c.findIndex((e) => e.account_id === current.account_id);
        if (existingIdx >= 0) {
          const copy = [...c];
          copy[existingIdx] = entry;
          return copy;
        }
        return [...c, entry];
      });
      advance();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function advance() {
    setBalance("");
    setAsOfDate(new Date().toISOString().slice(0, 10));
    setIndex((i) => i + 1);
  }

  function handleBack() {
    if (!queue || index === 0) return;
    setError(null);
    const prevIndex = index - 1;
    const prevAccount = queue[prevIndex];
    const existing = changes.find((c) => c.account_id === prevAccount.account_id);
    setBalance(existing ? String(existing.after) : "");
    setAsOfDate(existing ? existing.full_date : new Date().toISOString().slice(0, 10));
    setIndex(prevIndex);
  }

  async function handleClosed() {
    if (!current) return;
    const endDate = window.prompt("Close this account as of (YYYY-MM-DD):", asOfDate);
    if (!endDate) return;
    try {
      await api.post(`/accounts/${current.account_id}/close`, { effective_end_date: endDate });
      advance();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  if (queue === null) {
    return <LoadingBlock />;
  }

  if (queue.length === 0) {
    return (
      <div className="p-6 flex flex-col gap-3">
        <h1 className="text-lg font-medium">Update balances</h1>
        <p className="text-sm text-nw-muted">
          No accounts yet.{" "}
          <Link href="/accounts" className="text-nw-mint">
            Add an account
          </Link>{" "}
          first.
        </p>
      </div>
    );
  }

  if (index >= queue.length) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-4 max-w-md">
        <div className="rounded-lg border border-nw-green-line bg-nw-green-tint text-nw-mint px-4 py-6 text-center">
          <div className="text-sm">{changes.length} accounts updated</div>
        </div>
        <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-wide text-nw-muted">What moved</div>
          {changes.map((c) => {
            const delta = c.before === null ? null : c.after - c.before;
            return (
              <div key={c.account_name} className="flex justify-between text-sm">
                <span>{c.account_name}</span>
                <span className={delta !== null && delta < 0 ? "text-nw-coral" : "text-nw-green"}>
                  {delta === null ? "new" : `${delta >= 0 ? "+" : ""}${money(delta)}`}
                </span>
              </div>
            );
          })}
          {changes.length === 0 && <p className="text-xs text-nw-muted">Nothing updated this round.</p>}
        </div>
        <button onClick={handleBack} className="text-xs text-nw-mint text-center">
          ← Back to fix the last entry
        </button>
        <Link href="/overview">
          <Button variant="primary" className="w-full">
            Back to overview
          </Button>
        </Link>
      </div>
    );
  }

  const stale = current ? staleByAccount[current.account_id] : undefined;

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-md">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Update balances</h1>
        <span className="text-xs text-nw-muted">
          {index + 1} / {queue.length}
        </span>
      </div>

      {index > 0 && (
        <button onClick={handleBack} className="text-xs text-nw-mint self-start -mt-2">
          ← Back
        </button>
      )}

      <div className="flex gap-1">
        {queue.map((_, i) => (
          <div
            key={i}
            className={"h-1.5 flex-1 rounded-full " + (i < index ? "bg-nw-green-deep" : i === index ? "bg-nw-green" : "bg-nw-track")}
          />
        ))}
      </div>

      <div className="rounded-lg border border-nw-border bg-nw-surface p-4 flex flex-col gap-3">
        <div>
          <div className="text-xs text-nw-muted">
            {current!.institution_name} · {current!.category}
          </div>
          <div className="text-base font-medium">{current!.account_name}</div>
        </div>
        {stale && (
          <div className="flex items-center gap-2 text-xs text-nw-amber">
            <span className="w-1.5 h-1.5 rounded-full bg-nw-amber" />
            {stale.last_real_date
              ? `Last ${money(current!.latest_balance ?? 0)} on ${stale.last_real_date} · ${stale.days_stale}d ago`
              : "No snapshot yet"}
          </div>
        )}
        <TextField
          label="Balance"
          type="number"
          step="0.01"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder="$"
          autoFocus
        />
        <TextField
          label="As of date"
          type="date"
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value)}
        />
        {error && <p className="text-xs text-nw-coral">{error}</p>}
        <Button variant="primary" disabled={!balance || submitting} onClick={handleSaveAndNext}>
          {submitting ? "Saving…" : "Save & next"}
        </Button>
        <Button className="w-full" onClick={handleClosed}>
          Account closed
        </Button>
        <p className="text-xs text-nw-muted text-center">
          Every active account needs a balance before you can finish — there's no skipping.
        </p>
      </div>
    </div>
  );
}
