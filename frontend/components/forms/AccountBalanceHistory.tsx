"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Account, Balance } from "@/lib/types";
import { money } from "@/lib/format";
import { LoadingBlock } from "@/components/ui/Spinner";

export function AccountBalanceHistory({ account }: { account: Account }) {
  const [balances, setBalances] = useState<Balance[] | null>(null);

  useEffect(() => {
    setBalances(null);
    api.get<Balance[]>(`/balances?account_id=${account.account_id}`).then(setBalances);
  }, [account.account_id]);

  if (balances === null) return <LoadingBlock className="py-6" />;
  if (balances.length === 0) return <p className="text-xs text-nw-muted">No balance snapshots recorded yet.</p>;

  const sorted = [...balances].sort((a, b) => b.full_date.localeCompare(a.full_date));

  return (
    <div className="flex flex-col gap-1 max-h-[calc(100vh-260px)] overflow-y-auto">
      <div className="flex justify-between text-[10px] uppercase tracking-wide text-nw-muted px-1">
        <span>Date</span>
        <span>Balance</span>
      </div>
      {sorted.map((b) => (
        <div key={b.balance_id} className="flex justify-between text-sm px-1 py-1 border-b border-nw-border last:border-0">
          <span className="text-nw-muted">{b.full_date}</span>
          <span className={account.balance_type === "liability" ? "text-nw-coral" : ""}>{money(b.balance)}</span>
        </div>
      ))}
    </div>
  );
}
