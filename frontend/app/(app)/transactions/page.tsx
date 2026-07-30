"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { TransactionRecord } from "@/lib/types";
import { TextField } from "@/components/ui/TextField";

function money(v: string) {
  return Number(v).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionRecord[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const id = setTimeout(() => {
      api.get<TransactionRecord[]>(`/transactions?${params.toString()}`).then(setTransactions);
    }, 250);
    return () => clearTimeout(id);
  }, [search]);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-3xl">
      <h1 className="text-lg font-medium">Transactions</h1>
      <TextField
        placeholder="Search merchant…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {transactions?.length === 0 && (
        <p className="text-sm text-nw-muted">
          No transactions yet. Import an EveryDollar export to see cash flow — net worth
          still works without it.
        </p>
      )}

      <div className="flex flex-col">
        {transactions?.map((t) => (
          <div
            key={t.transaction_id}
            className="flex items-center justify-between gap-2 py-2 border-t border-nw-border first:border-t-0 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate">{t.merchant || "—"}</div>
              <div className="text-xs text-nw-muted truncate">
                {t.date} · {t.group ?? "—"} {t.item ? `› ${t.item}` : ""} · {t.account_name ?? "—"}
              </div>
            </div>
            <div className={t.type === "income" ? "text-nw-green" : ""}>{money(t.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
