"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Account, Balance } from "@/lib/types";
import { money, formatFullDate } from "@/lib/format";
import { LoadingBlock } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

export function AccountBalanceHistory({ account }: { account: Account }) {
  const [balances, setBalances] = useState<Balance[] | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.get<Balance[]>(`/balances?account_id=${account.account_id}`).then(setBalances);
  }

  useEffect(() => {
    setBalances(null);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.account_id]);

  async function addBalance(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post("/balances", { account_id: account.account_id, full_date: date, balance: Number(amount) });
      setAmount("");
      reload();
    } catch {
      setError("Couldn't save that balance.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBalance(balanceId: string) {
    if (!window.confirm("Delete this balance snapshot?")) return;
    await api.delete(`/balances/${balanceId}`);
    reload();
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={addBalance} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <TextField
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full"
            />
          </div>
          <div className="flex-1 min-w-0">
            <TextField
              label="Balance ($)"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full"
            />
          </div>
        </div>
        {error && <p className="text-xs text-nw-coral">{error}</p>}
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : "+ Add balance"}
        </Button>
      </form>

      {balances === null ? (
        <LoadingBlock className="py-6" />
      ) : balances.length === 0 ? (
        <p className="text-xs text-nw-muted">No balance snapshots recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-1 max-h-[calc(100vh-420px)] overflow-y-auto pt-1 border-t border-nw-border">
          <div className="flex justify-between text-[10px] uppercase tracking-wide text-nw-muted px-1 pt-2">
            <span>Date</span>
            <span>Balance</span>
          </div>
          {[...balances]
            .sort((a, b) => b.full_date.localeCompare(a.full_date))
            .map((b) => (
              <div key={b.balance_id} className="flex justify-between items-center text-sm px-1 py-1 border-b border-nw-border last:border-0">
                <span className="text-nw-muted">{formatFullDate(b.full_date)}</span>
                <div className="flex items-center gap-2">
                  <span className={account.balance_type === "liability" ? "text-nw-coral" : ""}>{money(b.balance)}</span>
                  <button
                    type="button"
                    aria-label="Delete balance"
                    onClick={() => deleteBalance(b.balance_id)}
                    className="text-nw-muted hover:text-nw-coral text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
