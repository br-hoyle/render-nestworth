"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type {
  Account,
  AccountSparkline,
  BalanceGridResponse,
  BalanceHistoryResponse,
  BulkBalanceImportResult,
} from "@/lib/types";
import { money as fmtMoney, titleCase, computeChangePct } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Sparkline } from "@/components/charts/Sparkline";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { AccountForm, AccountFormValues } from "@/components/forms/AccountForm";
import { AccountBalanceHistory } from "@/components/forms/AccountBalanceHistory";
import { LoadingBlock } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";

type Filter = "active" | "closed" | "all";

const HISTORY_PAGE_SIZES = [15, 25, 50, 100] as const;

function money(v: string | null) {
  if (v === null) return "—";
  return fmtMoney(v);
}

// A subtle right-edge shadow on the sticky column(s), shown only once the table has actually
// been scrolled — the common "there's more content this way" affordance — rather than a
// permanent divider that's misleading when there's nothing left to reveal.
const STICKY_COL = "sticky left-0 z-10";
const SCROLL_SHADOW = "shadow-[6px_0_8px_-6px_rgba(0,0,0,0.6)]";
const GRID_LIMIT = 6;

// Mirrors Overview's Balance-by-Category table (one shared header, dark category-total rows),
// but the Accounts page keeps individual account rows — clickable to open the edit/history
// panel — instead of aggregating them into account-type rows.
function CombinedAccountsTable({
  grid,
  onOpenAccount,
}: {
  grid: BalanceGridResponse;
  onOpenAccount: (accountId: string) => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const dates = grid.dates;
  const shadow = scrolled ? " " + SCROLL_SHADOW : "";

  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface p-4 flex flex-col gap-3">
      <div className="text-sm font-medium">Account Balances</div>
      <div onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 2)} className="overflow-x-auto">
        <table className="text-xs w-full min-w-max border-collapse">
          <thead>
            <tr className="text-nw-muted text-left">
              <th className={STICKY_COL + " bg-nw-surface pr-4 py-2 font-normal whitespace-nowrap" + shadow}>Category / Account</th>
              {dates.map((d) => (
                <th key={d} className="px-3 py-2 font-normal text-right whitespace-nowrap">
                  {d}
                </th>
              ))}
              <th className="px-3 py-2 font-normal text-right whitespace-nowrap">Last Change</th>
              <th className="px-3 py-2 font-normal text-right whitespace-nowrap">Change</th>
            </tr>
          </thead>
          <tbody>
            {grid.categories.flatMap((cat) => {
              const categoryTotals = cat.totals.map(Number);
              const catChange = computeChangePct(categoryTotals);
              return [
                <tr key={cat.category} className="border-t border-nw-border font-medium bg-nw-rail">
                  <td className={STICKY_COL + " bg-nw-rail pr-4 py-2 whitespace-nowrap" + shadow}>{titleCase(cat.category)}</td>
                  {categoryTotals.map((t, i) => (
                    <td key={i} className={"px-3 py-2 text-right whitespace-nowrap " + (t < 0 ? "text-nw-coral" : "")}>
                      {money(String(t))}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <ChangeCell pct={catChange.last} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ChangeCell pct={catChange.overall} />
                  </td>
                </tr>,
                ...cat.rows.map((row) => {
                  const nums = row.values.map((v) => (v === null ? null : Number(v)));
                  const { last, overall } = computeChangePct(nums);
                  return (
                    <tr
                      key={row.account_id}
                      className="border-t border-nw-border text-nw-muted text-[10px] cursor-pointer hover:bg-nw-rail/40"
                      onClick={() => onOpenAccount(row.account_id)}
                    >
                      <td
                        className={
                          STICKY_COL +
                          " bg-nw-surface pr-4 py-1.5 pl-4 whitespace-nowrap underline decoration-dotted underline-offset-2" +
                          shadow
                        }
                      >
                        {row.account_name} ({row.account_type})
                      </td>
                      {nums.map((n, i) => (
                        <td
                          key={i}
                          className={"px-3 py-1.5 text-right whitespace-nowrap " + (row.balance_type === "liability" && n ? "text-nw-coral" : "")}
                        >
                          {n === null ? "—" : row.balance_type === "liability" ? `−${money(String(n))}` : money(String(n))}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-right">
                        <ChangeCell pct={last} />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <ChangeCell pct={overall} />
                      </td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// All-time balance history across every account, grouped by institution — a spreadsheet-style
// view distinct from the "current" combined table above. Date + Net Worth are pinned while the
// per-institution/account columns scroll horizontally underneath.
function BalanceHistoryTable({ data }: { data: BalanceHistoryResponse }) {
  const [scrolled, setScrolled] = useState(false);
  const [dateColWidth, setDateColWidth] = useState(96);
  const dateColRef = useRef<HTMLTableCellElement>(null);

  // Tracks the Date column's actual rendered width live (not just once on data load) — its
  // width can shift with viewport size (the table's w-full stretches columns when there's no
  // overflow), and a stale width here would misalign the Net Worth column's sticky offset.
  useEffect(() => {
    const el = dateColRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
      setDateColWidth(width);
    });
    observer.observe(el, { box: "border-box" });
    return () => observer.disconnect();
  }, [data]);

  const shadow = scrolled ? " " + SCROLL_SHADOW : "";
  const netWorthStyle = { left: dateColWidth };

  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface p-4 flex flex-col gap-3">
      <div className="text-sm font-medium">All Balances Over Time</div>
      <div onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 2)} className="overflow-x-auto">
        <table className="text-xs w-full min-w-max border-collapse">
          <thead>
            <tr className="text-nw-muted text-left">
              <th
                ref={dateColRef}
                rowSpan={2}
                className={STICKY_COL + " z-20 bg-nw-surface px-3 py-2 font-normal whitespace-nowrap align-bottom"}
              >
                Date
              </th>
              <th
                rowSpan={2}
                style={netWorthStyle}
                className={"sticky z-20 bg-nw-surface px-3 py-2 font-normal text-right whitespace-nowrap align-bottom" + shadow}
              >
                Net Worth
              </th>
              {data.institutions.map((inst) => (
                <th
                  key={inst.institution_name}
                  colSpan={inst.accounts.length}
                  className="px-3 py-2 font-normal text-center whitespace-nowrap border-l border-nw-border"
                >
                  {inst.institution_name}
                </th>
              ))}
            </tr>
            <tr className="text-nw-muted text-left">
              {data.institutions.flatMap((inst) =>
                inst.accounts.map((a, i) => (
                  <th
                    key={a.account_id}
                    className={"px-3 py-2 font-normal text-right whitespace-nowrap" + (i === 0 ? " border-l border-nw-border" : "")}
                  >
                    {a.account_name}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {data.dates.map((d, i) => {
              const nw = Number(data.net_worth[i]);
              return (
                <tr key={d} className="border-t border-nw-border">
                  <td className={STICKY_COL + " bg-nw-surface px-3 py-2 whitespace-nowrap"}>{d}</td>
                  <td
                    style={netWorthStyle}
                    className={
                      "sticky bg-nw-surface px-3 py-2 text-right whitespace-nowrap font-medium" + (nw < 0 ? " text-nw-coral" : "") + shadow
                    }
                  >
                    {money(String(nw))}
                  </td>
                  {data.institutions.flatMap((inst) =>
                    inst.accounts.map((a, j) => {
                      const raw = a.values[i];
                      const v = raw === null ? 0 : Number(raw);
                      return (
                        <td
                          key={a.account_id}
                          className={
                            "px-3 py-2 text-right whitespace-nowrap" +
                            (j === 0 ? " border-l border-nw-border" : "") +
                            (a.balance_type === "liability" && v ? " text-nw-coral" : "")
                          }
                        >
                          {a.balance_type === "liability" && v ? `−${money(String(v))}` : money(String(v))}
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AccountsPage() {
  const [view, setView] = useState<"balances" | "history">("balances");
  const [filter, setFilter] = useState<Filter>("active");
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [sparklinesLoaded, setSparklinesLoaded] = useState(false);
  const [grid, setGrid] = useState<BalanceGridResponse | null>(null);
  const [history, setHistory] = useState<BalanceHistoryResponse | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState<15 | 25 | 50 | 100>(25);
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
    setSparklinesLoaded(true);
  }

  async function loadGrid() {
    const data = await api.get<BalanceGridResponse>(`/accounts/balance-grid?limit=${GRID_LIMIT}`);
    setGrid(data);
  }

  async function loadHistory(page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;
    const data = await api.get<BalanceHistoryResponse>(
      `/accounts/balance-history?limit=${pageSize}&offset=${offset}`
    );
    setHistory(data);
  }

  useEffect(() => {
    load();
    loadSparklines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    if (filter === "active") loadGrid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Fetched whenever the History tab is active and the page/page-size changes — cheap now
  // that the query is bounded by pageSize rather than an all-time fetch. Changing the page
  // size resets to page 1 in the same handler (see the <select> below) rather than a
  // separate effect, so the two state changes land in one fetch instead of two.
  useEffect(() => {
    if (view === "history") loadHistory(historyPage, historyPageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, historyPage, historyPageSize]);

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
        effective_end_date: values.end_date,
      });
      setPanel(null);
      await load();
      if (filter === "active") await loadGrid();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Could not create account.");
    }
  }

  async function handleUpdate(account: Account, values: AccountFormValues) {
    await api.patch(`/accounts/${account.account_id}`, {
      account_name: values.account_name,
      institution_name: values.institution_name,
      category: values.category,
      account_type: values.account_type,
      balance_type: values.balance_type,
      effective_start_date: values.start_date,
      effective_end_date: values.end_date,
    });
    setPanel(null);
    await load();
    if (filter === "active") await loadGrid();
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

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex border border-nw-border rounded-md overflow-hidden text-xs w-fit">
          <button
            onClick={() => setView("balances")}
            className={"px-3 py-1.5 " + (view === "balances" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
          >
            Balances
          </button>
          <button
            onClick={() => setView("history")}
            className={"px-3 py-1.5 " + (view === "history" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
          >
            History
          </button>
        </div>

        {view === "balances" && (
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
        )}
      </div>

      {error && <p className="text-xs text-nw-coral">{error}</p>}

      {view === "history" ? (
        <div className="flex flex-col gap-4">
          {history === null && <LoadingBlock />}
          {history?.total_dates === 0 && (
            <p className="text-sm text-nw-muted">
              No balance history yet. Add your first account, or upload balance history once it exists.
            </p>
          )}
          {history && history.total_dates > 0 && (
            <>
              <BalanceHistoryTable data={history} />
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-nw-muted">
                <div className="flex items-center gap-2">
                  <span>Rows per page</span>
                  {HISTORY_PAGE_SIZES.map((size) => (
                    <button
                      key={size}
                      onClick={() => {
                        setHistoryPageSize(size);
                        setHistoryPage(1);
                      }}
                      className={
                        "px-2 py-1 rounded-full border " +
                        (historyPageSize === size ? "border-nw-green-line text-nw-mint bg-nw-green-tint" : "border-nw-border")
                      }
                    >
                      {size}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span>
                    {(historyPage - 1) * historyPageSize + 1}–
                    {Math.min(history.total_dates, historyPage * historyPageSize)} of {history.total_dates}
                  </span>
                  <Button onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={historyPage === 1}>
                    ‹
                  </Button>
                  <Button
                    onClick={() =>
                      setHistoryPage((p) => Math.min(Math.ceil(history.total_dates / historyPageSize), p + 1))
                    }
                    disabled={historyPage >= Math.ceil(history.total_dates / historyPageSize)}
                  >
                    ›
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {filter === "active" ? (
            <>
              {grid === null && <LoadingBlock />}
              {grid?.categories.length === 0 && (
                <p className="text-sm text-nw-muted">
                  No balance history yet. Add your first account, or upload balance history once it exists.
                </p>
              )}

              {grid && grid.categories.length > 0 && (
                <CombinedAccountsTable
                  grid={grid}
                  onOpenAccount={(accountId) => {
                    const acct = accountsById.get(accountId);
                    if (acct) setPanel(acct);
                  }}
                />
              )}
            </>
          ) : (
            <>
              {accounts === null && <LoadingBlock />}
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
                      {a.is_open && sparklinesLoaded && (
                        <Sparkline
                          values={sparklines[a.account_id] ?? []}
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
                startDateLabel="Account Open Date"
                endDateLabel="Account Closure Date"
                submitLabel="Create account"
                onSubmit={handleCreate}
                onCancel={() => setPanel(null)}
                onClose={() => setPanel(null)}
              />
            ) : panelTab === "history" ? (
              <AccountBalanceHistory account={panel} />
            ) : (
              <AccountForm
                initial={{
                  account_name: panel.account_name,
                  institution_name: panel.institution_name,
                  category: panel.category,
                  account_type: panel.account_type,
                  balance_type: panel.balance_type,
                  start_date: panel.effective_start_date,
                  end_date: panel.effective_end_date,
                }}
                startDateLabel="Account Open Date"
                endDateLabel="Account Closure Date"
                submitLabel="Save changes"
                onSubmit={(values) => handleUpdate(panel, values)}
                onCancel={() => setPanel(null)}
                onClose={() => setPanel(null)}
              />
            )}
          </div>
        )}
      </div>
      )}

      {bulkUploadOpen && (
        <BulkUploadModal
          accounts={accounts ?? []}
          onClose={() => setBulkUploadOpen(false)}
          onDone={() => {
            setBulkUploadOpen(false);
            load();
            loadSparklines();
            if (filter === "active") loadGrid();
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
    <Modal onClose={onClose} className="w-full max-w-2xl rounded-lg border border-nw-border bg-nw-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Upload balances</h2>
        <button type="button" onClick={onClose} className="text-nw-muted text-xs">✕</button>
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
                  <span className="flex-1 break-words">{label}</span>
                  <select
                    value={mapping[label] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [label]: e.target.value }))}
                    className="w-64 flex-none rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs"
                  >
                    <option value="">Skip</option>
                    {accounts.map((a) => (
                      <option key={a.account_id} value={a.account_id}>
                        {a.account_name} - {a.account_type} ({a.institution_name})
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
    </Modal>
  );
}
