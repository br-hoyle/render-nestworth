"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Account, AccountSparkline, BalanceGridCategory, BalanceGridResponse, BulkBalanceImportResult } from "@/lib/types";
import { money as fmtMoney, titleCase, computeChangePct } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Sparkline } from "@/components/charts/Sparkline";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { AccountForm, AccountFormValues } from "@/components/forms/AccountForm";
import { AccountBalanceHistory } from "@/components/forms/AccountBalanceHistory";

type Filter = "active" | "closed" | "all";

function money(v: string | null) {
  if (v === null) return "—";
  return fmtMoney(v);
}

// A subtle right-edge shadow on the sticky column, shown only once the table has actually
// been scrolled — the common "there's more content this way" affordance — rather than a
// permanent divider that's misleading when there's nothing left to reveal.
const STICKY_COL = "sticky left-0 z-10 bg-nw-surface";
const SCROLL_SHADOW = "shadow-[6px_0_8px_-6px_rgba(0,0,0,0.6)]";

function CategoryBalanceTable({
  cat,
  dates,
  onOpenAccount,
}: {
  cat: BalanceGridCategory;
  dates: string[];
  onOpenAccount: (accountId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  function handleScroll() {
    setScrolled((scrollRef.current?.scrollLeft ?? 0) > 2);
  }

  const stickyCellClass = STICKY_COL + " " + (scrolled ? SCROLL_SHADOW : "");

  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface p-4 flex flex-col gap-3">
      <div className="text-sm font-medium">{titleCase(cat.category)}</div>
      <div ref={scrollRef} onScroll={handleScroll} className="overflow-x-auto">
        <table className="text-xs w-full min-w-max border-collapse">
          <thead>
            <tr className="text-nw-muted text-left">
              <th className={stickyCellClass + " pr-4 py-2 font-normal whitespace-nowrap"}>Account Name (Institution)</th>
              {dates.map((d) => (
                <th key={d} className="px-3 py-2 font-normal text-right whitespace-nowrap">
                  {d}
                </th>
              ))}
              <th className="px-3 py-2 font-normal whitespace-nowrap">Balance Trend</th>
              <th className="px-3 py-2 font-normal text-right whitespace-nowrap">Last Change</th>
              <th className="px-3 py-2 font-normal text-right whitespace-nowrap">Change</th>
            </tr>
          </thead>
          <tbody>
            {cat.rows.map((row) => {
              const nums = row.values.map((v) => (v === null ? null : Number(v)));
              const { last, overall } = computeChangePct(nums);
              const sparkValues = nums.filter((n): n is number => n !== null);
              return (
                <tr
                  key={row.account_id}
                  className="border-t border-nw-border cursor-pointer hover:bg-nw-rail/40"
                  onClick={() => onOpenAccount(row.account_id)}
                >
                  <td className={stickyCellClass + " pr-4 py-2.5 whitespace-nowrap underline decoration-dotted underline-offset-2"}>
                    {row.account_name} ({row.institution_name})
                  </td>
                  {nums.map((n, i) => (
                    <td
                      key={i}
                      className={"px-3 py-2.5 text-right whitespace-nowrap " + (row.balance_type === "liability" && n ? "text-nw-coral" : "")}
                    >
                      {n === null ? "—" : row.balance_type === "liability" ? `−${money(String(n))}` : money(String(n))}
                    </td>
                  ))}
                  <td className="px-3 py-2.5">
                    {sparkValues.length > 1 && (
                      <Sparkline
                        values={sparkValues}
                        color={row.balance_type === "liability" ? "var(--nw-coral)" : "var(--nw-green)"}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <ChangeCell pct={last} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <ChangeCell pct={overall} />
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-nw-border font-medium">
              <td className={stickyCellClass + " pr-4 py-2.5 whitespace-nowrap"}>Total</td>
              {cat.totals.map((t, i) => (
                <td key={i} className={"px-3 py-2.5 text-right whitespace-nowrap " + (Number(t) < 0 ? "text-nw-coral" : "")}>
                  {money(t)}
                </td>
              ))}
              <td className="px-3 py-2.5">
                {cat.totals.length > 1 && <Sparkline values={cat.totals.map(Number)} color="var(--nw-mint)" />}
              </td>
              {(() => {
                const { last, overall } = computeChangePct(cat.totals.map(Number));
                return (
                  <>
                    <td className="px-3 py-2.5 text-right">
                      <ChangeCell pct={last} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <ChangeCell pct={overall} />
                    </td>
                  </>
                );
              })()}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AccountsPage() {
  const [filter, setFilter] = useState<Filter>("active");
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [gridLimit, setGridLimit] = useState(8);
  const [grid, setGrid] = useState<BalanceGridResponse | null>(null);
  const [panel, setPanel] = useState<null | "create" | Account>(null);
  const [panelTab, setPanelTab] = useState<"edit" | "history">("edit");
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await api.get<Account[]>(`/accounts?filter=${filter}`);
    setAccounts(data);
  }

  async function loadSparklines() {
    const data = await api.get<AccountSparkline[]>("/accounts/sparklines");
    const map: Record<string, number[]> = {};
    for (const s of data) map[s.account_id] = s.points.map((p) => Number(p.balance));
    setSparklines(map);
  }

  async function loadGrid(limit: number) {
    const data = await api.get<BalanceGridResponse>(`/accounts/balance-grid?limit=${limit}`);
    setGrid(data);
  }

  useEffect(() => {
    load();
    loadSparklines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    if (filter === "active") loadGrid(gridLimit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, gridLimit]);

  useEffect(() => {
    setPanelTab("edit");
  }, [panel]);

  const grouped = (accounts ?? []).reduce<Record<string, Account[]>>((acc, a) => {
    (acc[a.category] ??= []).push(a);
    return acc;
  }, {});
  const accountsById = new Map((accounts ?? []).map((a) => [a.account_id, a]));

  async function handleCreate(values: AccountFormValues) {
    setError(null);
    try {
      await api.post("/accounts", {
        account_name: values.account_name,
        institution_name: values.institution_name,
        category: values.category,
        account_type: values.account_type,
        balance_type: values.balance_type,
        effective_start_date: values.start_date,
      });
      setPanel(null);
      await load();
      if (filter === "active") await loadGrid(gridLimit);
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Could not create account.");
    }
  }

  async function handleRevise(account: Account, values: AccountFormValues) {
    try {
      await api.patch(`/accounts/${account.account_id}`, {
        account_name: values.account_name,
        institution_name: values.institution_name,
        category: values.category,
        account_type: values.account_type,
        balance_type: values.balance_type,
        new_revision_start_date: values.start_date,
      });
      setPanel(null);
      await load();
      if (filter === "active") await loadGrid(gridLimit);
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Could not save revision.");
    }
  }

  async function handleClose(account: Account) {
    const endDate = window.prompt("Close this account as of (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
    if (!endDate) return;
    try {
      await api.post(`/accounts/${account.account_id}/close`, { effective_end_date: endDate });
      await load();
      if (filter === "active") await loadGrid(gridLimit);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not close account.");
    }
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-medium">Accounts</h1>
        <div className="flex gap-2">
          <Button onClick={() => setBulkUploadOpen(true)}>Upload balances</Button>
          <Button variant="primary" onClick={() => setPanel("create")}>
            + New account
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        {(["active", "closed", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              "px-3 py-1 rounded-full text-xs border capitalize " +
              (filter === f
                ? "border-nw-green-line text-nw-mint bg-nw-green-tint"
                : "border-nw-border text-nw-muted")
            }
          >
            {f}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-nw-coral">{error}</p>}

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {filter === "active" ? (
            <>
              <div className="flex items-center justify-between gap-4 flex-wrap rounded-lg border border-nw-border bg-nw-surface p-3">
                <div>
                  <div className="text-sm font-medium">Recent Balance Changes</div>
                  <p className="text-xs text-nw-muted">
                    Balance trends by category. Use the slider to adjust how many recent entries are included.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <span className="text-[10px] uppercase tracking-wide text-nw-muted whitespace-nowrap">
                    Entries to Show
                  </span>
                  <input
                    type="range"
                    min={3}
                    max={10}
                    value={gridLimit}
                    onChange={(e) => setGridLimit(Number(e.target.value))}
                    className="w-40 accent-[var(--nw-green)]"
                  />
                  <span className="text-sm w-6 text-right">{gridLimit}</span>
                </div>
              </div>

              {grid === null && <p className="text-sm text-nw-muted">Loading…</p>}
              {grid?.categories.length === 0 && (
                <p className="text-sm text-nw-muted">
                  No balance history yet. Add your first account, or upload balance history once it exists.
                </p>
              )}

              {grid?.categories.map((cat) => (
                <CategoryBalanceTable
                  key={cat.category}
                  cat={cat}
                  dates={grid.dates}
                  onOpenAccount={(accountId) => {
                    const acct = accountsById.get(accountId);
                    if (acct) setPanel(acct);
                  }}
                />
              ))}
            </>
          ) : (
            <>
              {accounts === null && <p className="text-sm text-nw-muted">Loading…</p>}
              {accounts?.length === 0 && (
                <p className="text-sm text-nw-muted">
                  No accounts yet. Add your first account, or upload balance history once it exists.
                </p>
              )}
              {Object.entries(grouped).map(([category, list]) => (
                <div key={category} className="flex flex-col gap-1">
                  <div className="text-[10px] uppercase tracking-wide text-nw-muted px-1">{category}</div>
                  {list.map((a) => (
                    <div
                      key={a.account_id}
                      className="flex items-center justify-between gap-2 rounded-md border border-nw-border bg-nw-surface px-3 py-2 text-sm hover:border-nw-line-hi"
                    >
                      <button onClick={() => setPanel(a)} className="min-w-0 text-left flex-1">
                        <div className="truncate">
                          {a.account_name} {!a.is_open && <span className="text-nw-muted text-xs">closed</span>}
                        </div>
                        <div className="text-xs text-nw-muted truncate">
                          {a.institution_name} · {a.account_type}
                        </div>
                      </button>
                      {a.is_open && sparklines[a.account_id]?.length > 1 && (
                        <Sparkline
                          values={sparklines[a.account_id]}
                          color={a.balance_type === "liability" ? "var(--nw-coral)" : "var(--nw-green)"}
                        />
                      )}
                      <div className={"text-right " + (a.balance_type === "liability" ? "text-nw-coral" : "")}>
                        {a.balance_type === "liability" && a.latest_balance ? "−" : ""}
                        {money(a.latest_balance)}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>

        {panel && (
          <div className="w-full md:w-[340px] flex-none rounded-lg border border-nw-border bg-nw-rail p-3">
            {panel !== "create" && (
              <div className="flex border border-nw-border rounded-md overflow-hidden text-xs mb-3">
                <button
                  onClick={() => setPanelTab("edit")}
                  className={"flex-1 px-2.5 py-1.5 " + (panelTab === "edit" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
                >
                  Edit
                </button>
                <button
                  onClick={() => setPanelTab("history")}
                  className={"flex-1 px-2.5 py-1.5 " + (panelTab === "history" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
                >
                  Balance History
                </button>
              </div>
            )}

            {panel === "create" ? (
              <AccountForm
                startDateLabel="Effective start date"
                submitLabel="Create account"
                onSubmit={handleCreate}
                onCancel={() => setPanel(null)}
                onClose={() => setPanel(null)}
              />
            ) : panelTab === "history" ? (
              <AccountBalanceHistory account={panel} />
            ) : (
              <>
                <AccountForm
                  initial={{
                    account_name: panel.account_name,
                    institution_name: panel.institution_name,
                    category: panel.category,
                    account_type: panel.account_type,
                    balance_type: panel.balance_type,
                    start_date: new Date().toISOString().slice(0, 10),
                  }}
                  startDateLabel="New revision starts"
                  note="Editing never rewrites history. Saving closes the current row at the date below and opens a new one."
                  submitLabel="Save revision"
                  onSubmit={(values) => handleRevise(panel, values)}
                  onCancel={() => setPanel(null)}
                  onClose={() => setPanel(null)}
                />
                {panel.is_open && (
                  <button onClick={() => handleClose(panel)} className="mt-3 text-xs text-nw-coral">
                    Close account…
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {bulkUploadOpen && (
        <BulkUploadModal
          accounts={accounts ?? []}
          onClose={() => setBulkUploadOpen(false)}
          onDone={() => {
            setBulkUploadOpen(false);
            load();
            loadSparklines();
            if (filter === "active") loadGrid(gridLimit);
          }}
        />
      )}
    </div>
  );
}

function BulkUploadModal({
  accounts,
  onClose,
  onDone,
}: {
  accounts: Account[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [distinctAccounts, setDistinctAccounts] = useState<string[] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkBalanceImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function detect(f: File) {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", f);
      const res = await api.upload<BulkBalanceImportResult>("/balances/bulk-import", formData);
      setFile(f);
      setDistinctAccounts(res.distinct_accounts ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "account_mapping",
        JSON.stringify(Object.fromEntries((distinctAccounts ?? []).map((label) => [label, mapping[label] || null])))
      );
      const res = await api.upload<BulkBalanceImportResult>("/balances/bulk-import", formData);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not import that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-lg border border-nw-border bg-nw-surface p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Upload balances</h2>
          <button onClick={onClose} className="text-nw-muted text-xs">✕</button>
        </div>

        {!distinctAccounts && (
          <>
            <p className="text-xs text-nw-muted">
              A CSV with columns <code>account</code>, <code>date</code>, and <code>balance</code> — any number of
              accounts in one file. Next you&apos;ll map each account label to a real account.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) detect(f);
              }}
            />
            <Button variant="primary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
              {busy ? "Reading…" : "Choose CSV file"}
            </Button>
          </>
        )}

        {distinctAccounts && !result && (
          <>
            <p className="text-xs text-nw-muted">Map each account label from the file to a real account (or skip it).</p>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {distinctAccounts.map((label) => (
                <div key={label} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{label}</span>
                  <select
                    value={mapping[label] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [label]: e.target.value }))}
                    className="w-40 flex-none rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs"
                  >
                    <option value="">Skip</option>
                    {accounts.map((a) => (
                      <option key={a.account_id} value={a.account_id}>
                        {a.account_name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <Button variant="primary" disabled={busy} onClick={commit}>
              {busy ? "Importing…" : "Import"}
            </Button>
          </>
        )}

        {error && <p className="text-xs text-nw-coral">{error}</p>}

        {result && (
          <div className="flex flex-col gap-1 text-xs">
            <p className="text-nw-green">{result.inserted_count} balances saved.</p>
            {!!result.skipped_count && <p className="text-nw-muted">{result.skipped_count} row(s) skipped (unmapped account).</p>}
            {result.errors.length > 0 && (
              <p className="text-nw-coral">
                {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped (unparseable date or balance).
              </p>
            )}
            <Button variant="primary" onClick={onDone}>
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
