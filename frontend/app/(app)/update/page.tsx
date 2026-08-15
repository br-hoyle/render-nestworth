"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Account, StaleAccountInfo } from "@/lib/types";
import { formatFullDate, titleCase } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { LoadingBlock } from "@/components/ui/Spinner";

function money(v: string | number) {
  return Number(v).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface RowState {
  date: string;
  balance: string;
  closing: boolean;
}

type SortKey = "balance_type" | "institution_name" | "account_type" | "account_name" | "date" | "balance";
type SortDir = "asc" | "desc";

interface SavedBalance {
  account_id: string;
  account_name: string;
  before: number | null;
  after: number;
}

interface SaveOutcome {
  balances: SavedBalance[];
  closedCount: number;
  failedCount: number;
}

export default function UpdatePage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [staleByAccount, setStaleByAccount] = useState<Record<string, StaleAccountInfo>>({});
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveOutcome | null>(null);

  useEffect(() => {
    (async () => {
      const [accts, stale] = await Promise.all([
        api.get<Account[]>("/accounts?filter=active"),
        api.get<StaleAccountInfo[]>("/accounts/stale"),
      ]);
      const staleMap: Record<string, StaleAccountInfo> = {};
      stale.forEach((s) => (staleMap[s.account_id] = s));
      setStaleByAccount(staleMap);
      const initialRows: Record<string, RowState> = {};
      accts.forEach((a) => {
        initialRows[a.account_id] = { date: todayStr(), balance: "", closing: false };
      });
      setRows(initialRows);
      setAccounts(accts);
    })();
  }, []);

  function updateRow(accountId: string, patch: Partial<RowState>) {
    setRows((r) => ({ ...r, [accountId]: { ...r[accountId], ...patch } }));
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedAccounts = useMemo(() => {
    if (!accounts) return [];
    const list = [...accounts];
    if (sortKey === null) {
      // Default order — stale accounts first, so the ones most in need of an update lead.
      return list.sort((a, b) => {
        const aStale = staleByAccount[a.account_id]?.is_stale ? 0 : 1;
        const bStale = staleByAccount[b.account_id]?.is_stale ? 0 : 1;
        return aStale - bStale;
      });
    }
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortKey === "date") {
        av = rows[a.account_id]?.date ?? "";
        bv = rows[b.account_id]?.date ?? "";
      } else if (sortKey === "balance") {
        av = Number(rows[a.account_id]?.balance || 0);
        bv = Number(rows[b.account_id]?.balance || 0);
      } else {
        av = a[sortKey];
        bv = b[sortKey];
      }
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    return list;
  }, [accounts, sortKey, sortDir, rows, staleByAccount]);

  function isRowDone(accountId: string): boolean {
    const row = rows[accountId];
    if (!row) return false;
    if (row.closing) return true;
    return row.balance.trim() !== "" && !Number.isNaN(Number(row.balance));
  }

  const allDone = (accounts ?? []).length > 0 && (accounts ?? []).every((a) => isRowDone(a.account_id));

  async function handleSave() {
    if (!accounts) return;
    setSaving(true);
    setSaveError(null);
    const outcomes = await Promise.allSettled(
      accounts.map(async (a) => {
        const row = rows[a.account_id];
        if (row.closing) {
          await api.post(`/accounts/${a.account_id}/close`, { effective_end_date: row.date });
          return { type: "closed" as const };
        }
        await api.post("/balances", { account_id: a.account_id, full_date: row.date, balance: Number(row.balance) });
        return {
          type: "balance" as const,
          account_id: a.account_id,
          account_name: a.account_name,
          before: a.latest_balance ? Number(a.latest_balance) : null,
          after: Number(row.balance),
        };
      })
    );

    const balances: SavedBalance[] = [];
    let closedCount = 0;
    let failedCount = 0;
    for (const o of outcomes) {
      if (o.status === "rejected") {
        failedCount++;
      } else if (o.value.type === "closed") {
        closedCount++;
      } else {
        balances.push(o.value);
      }
    }
    if (failedCount > 0) {
      setSaveError(`${failedCount} row${failedCount === 1 ? "" : "s"} failed to save — the rest were saved. Fix and try again.`);
    }
    setResult({ balances, closedCount, failedCount });
    setSaving(false);
  }

  if (accounts === null) {
    return <LoadingBlock />;
  }

  if (accounts.length === 0) {
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

  if (result) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-4 max-w-md">
        <h1 className="text-lg font-medium">Update balances</h1>
        <div className="rounded-lg border border-nw-border bg-nw-surface p-4 flex flex-col gap-1 text-sm">
          {result.balances.length > 0 && <p className="text-nw-green">{result.balances.length} balance(s) saved.</p>}
          {result.closedCount > 0 && (
            <p className="text-nw-muted">
              {result.closedCount} account{result.closedCount === 1 ? "" : "s"} closed.
            </p>
          )}
          {result.failedCount > 0 && (
            <p className="text-nw-coral">
              {result.failedCount} row{result.failedCount === 1 ? "" : "s"} failed to save.
            </p>
          )}
        </div>
        {result.balances.length > 0 && (
          <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2">
            <div className="text-[10px] uppercase tracking-wide text-nw-muted">What moved</div>
            {result.balances.map((b) => {
              const delta = b.before === null ? null : b.after - b.before;
              return (
                <div key={b.account_id} className="flex justify-between text-sm">
                  <span>{b.account_name}</span>
                  <span className={delta !== null && delta < 0 ? "text-nw-coral" : "text-nw-green"}>
                    {delta === null ? "new" : `${delta >= 0 ? "+" : ""}${money(delta)}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          {result.failedCount > 0 && (
            <Button className="flex-1" onClick={() => setResult(null)}>
              Back to table
            </Button>
          )}
          <Link href="/overview" className="flex-1">
            <Button variant="primary" className="w-full">
              Back to overview
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-1 text-nw-mint">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  function headerCell(label: string, key: SortKey, extraClass = "") {
    return (
      <th
        onClick={() => handleSort(key)}
        className={"px-2 py-2 font-normal text-left whitespace-nowrap cursor-pointer select-none hover:text-nw-text " + extraClass}
      >
        {label}
        {sortIndicator(key)}
      </th>
    );
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-medium">Update balances</h1>
        <span className="text-xs text-nw-muted">{accounts.length} active accounts</span>
      </div>

      <div className="rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-3">
        <div className="overflow-x-auto">
          <table className="text-xs w-full min-w-max border-collapse">
            <thead>
              <tr className="text-nw-muted border-b border-nw-border">
                {headerCell("Class", "balance_type")}
                {headerCell("Institution", "institution_name")}
                {headerCell("Account Type", "account_type")}
                {headerCell("Account Name", "account_name")}
                {headerCell("Date", "date")}
                {headerCell("Balance", "balance", "text-right")}
                <th className="px-2 py-2 font-normal text-left whitespace-nowrap">Close</th>
              </tr>
            </thead>
            <tbody>
              {sortedAccounts.map((a) => {
                const row = rows[a.account_id];
                if (!row) return null;
                const stale = staleByAccount[a.account_id];
                return (
                  <tr key={a.account_id} className="border-b border-nw-border last:border-0">
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className={a.balance_type === "liability" ? "text-nw-coral" : "text-nw-green"}>
                        {titleCase(a.balance_type)}
                      </span>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{a.institution_name}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{a.account_type}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {stale?.is_stale && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-nw-amber flex-none"
                            title={
                              stale.last_real_date
                                ? `Last ${money(a.latest_balance ?? 0)} on ${formatFullDate(stale.last_real_date)} · ${stale.days_stale}d ago`
                                : "No snapshot yet"
                            }
                          />
                        )}
                        <span>{a.account_name}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => updateRow(a.account_id, { date: e.target.value })}
                        className="rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs w-[140px]"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={row.closing}
                        value={row.balance}
                        onChange={(e) => updateRow(a.account_id, { balance: e.target.value })}
                        placeholder="$"
                        className="rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs w-[110px] text-right disabled:opacity-40"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Button
                        type="button"
                        variant={row.closing ? "danger" : "secondary"}
                        className="px-2 py-1 text-xs whitespace-nowrap"
                        onClick={() => updateRow(a.account_id, { closing: !row.closing })}
                      >
                        {row.closing ? "Closing ✕" : "Close"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {saveError && <p className="text-xs text-nw-coral">{saveError}</p>}

        <Button variant="primary" disabled={!allDone || saving} onClick={handleSave} className="w-full md:w-auto md:self-start">
          {saving ? "Saving…" : "Save"}
        </Button>
        {!allDone && (
          <p className="text-xs text-nw-muted">Every account needs a balance or to be marked closed before you can save.</p>
        )}
      </div>

      <p className="text-xs text-nw-muted">
        Liability balances don&apos;t need a minus sign — they&apos;re already applied as a negative to net worth based on
        the account&apos;s class.
      </p>
    </div>
  );
}
