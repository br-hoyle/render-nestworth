"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Account, Balance } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Card } from "@/components/ui/Card";

function money(v: string) {
  return Number(v).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function BalancesPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [selected, setSelected] = useState<Account | null>(null);
  const [history, setHistory] = useState<Balance[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    const data = await api.get<Account[]>("/accounts?filter=active");
    setAccounts(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function selectAccount(a: Account) {
    setSelected(a);
    setHistory(null);
    const data = await api.get<Balance[]>(`/balances?account_id=${a.account_id}`);
    setHistory(data.slice().reverse());
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Balances</h1>
        <Button variant="primary" onClick={() => setShowAdd(true)}>
          + Add
        </Button>
      </div>

      {showAdd && accounts && (
        <AddBalanceCard
          accounts={accounts}
          onDone={() => {
            setShowAdd(false);
            if (selected) selectAccount(selected);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {accounts?.length === 0 && (
        <p className="text-sm text-nw-muted">
          No accounts yet. Add an account, then record a balance.
        </p>
      )}

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          {accounts?.map((a) => (
            <button
              key={a.account_id}
              onClick={() => selectAccount(a)}
              className={
                "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm " +
                (selected?.account_id === a.account_id
                  ? "border-nw-green-line bg-nw-green-tint text-nw-mint"
                  : "border-nw-border bg-nw-surface")
              }
            >
              <span className="truncate">{a.account_name}</span>
              <span>{a.latest_balance ? money(a.latest_balance) : "—"}</span>
            </button>
          ))}
        </div>

        {selected && (
          <div className="w-full md:w-[320px] flex-none rounded-lg border border-nw-border bg-nw-rail p-3">
            <h2 className="text-sm font-medium mb-2">{selected.account_name} history</h2>
            {history === null && <p className="text-xs text-nw-muted">Loading…</p>}
            {history?.length === 0 && (
              <p className="text-xs text-nw-muted">No snapshots recorded yet.</p>
            )}
            <div className="flex flex-col">
              {history?.map((b) => (
                <div
                  key={b.balance_id}
                  className="flex justify-between text-xs py-1.5 border-t border-nw-border first:border-t-0"
                >
                  <span className="text-nw-muted">{b.full_date}</span>
                  <span>{money(b.balance)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AddBalanceCard({
  accounts,
  onDone,
  onCancel,
}: {
  accounts: Account[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.account_id ?? "");
  const [fullDate, setFullDate] = useState(new Date().toISOString().slice(0, 10));
  const [balance, setBalance] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/balances", { account_id: accountId, full_date: fullDate, balance: Number(balance) });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-nw-muted">Account</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.account_id} value={a.account_id}>
                {a.account_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <TextField
            label="As of date"
            type="date"
            value={fullDate}
            onChange={(e) => setFullDate(e.target.value)}
            required
          />
          <TextField
            label="Balance"
            type="number"
            step="0.01"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            required
          />
        </div>
        <p className="text-xs text-nw-muted">
          A snapshot already exists for this account on this date — saving replaces it. Any
          other date adds a new row.
        </p>
        {error && <p className="text-xs text-nw-coral">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Saving…" : "Save balance"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
