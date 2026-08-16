"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { TransactionFilterOptions, TransactionListResponse, TransactionRecord, UnclassifiedGroup } from "@/lib/types";
import { money, formatFullDate } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ImportWizard } from "@/components/transactions/ImportWizard";
import { ClassifyModal } from "@/components/transactions/ClassifyModal";
import { EditTransactionModal } from "@/components/transactions/EditTransactionModal";
import { AddTransactionModal } from "@/components/transactions/AddTransactionModal";
import { LoadingBlock } from "@/components/ui/Spinner";

const PAGE_SIZES = [15, 25, 50, 100];

const NEED_WANT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "needs", label: "Needs" },
  { value: "wants", label: "Wants" },
  { value: "savings", label: "Savings" },
  { value: "transfer", label: "Transfer" },
  { value: "other", label: "Other" },
];

interface Filters {
  start: string;
  end: string;
  group: string[];
  item: string[];
  search: string;
  account_name: string;
  amount_min: string;
  amount_max: string;
  flow_type: string;
}

const EMPTY_FILTERS: Filters = {
  start: "",
  end: "",
  group: [],
  item: [],
  search: "",
  account_name: "",
  amount_min: "",
  amount_max: "",
  flow_type: "",
};

export default function TransactionsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<TransactionListResponse | null>(null);
  const [unclassified, setUnclassified] = useState<UnclassifiedGroup[] | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showClassify, setShowClassify] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<TransactionRecord | null>(null);
  const [filterOptions, setFilterOptions] = useState<TransactionFilterOptions | null>(null);

  function load() {
    const params = new URLSearchParams();
    if (filters.start) params.set("start", filters.start);
    if (filters.end) params.set("end", filters.end);
    filters.group.forEach((g) => params.append("group", g));
    filters.item.forEach((i) => params.append("item", i));
    if (filters.search) params.set("search", filters.search);
    if (filters.account_name) params.set("account_name", filters.account_name);
    if (filters.amount_min) params.set("amount_min", filters.amount_min);
    if (filters.amount_max) params.set("amount_max", filters.amount_max);
    if (filters.flow_type) params.set("flow_type", filters.flow_type);
    params.set("limit", String(pageSize));
    params.set("offset", String(page * pageSize));
    api.get<TransactionListResponse>(`/transactions?${params.toString()}`).then(setResult);
  }

  function loadUnclassified() {
    api.get<UnclassifiedGroup[]>("/transactions/unclassified-summary").then(setUnclassified);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, pageSize, page]);

  useEffect(() => {
    loadUnclassified();
    api.get<TransactionFilterOptions>("/transactions/filter-options").then(setFilterOptions);
  }, []);

  useEffect(() => {
    setPage(0);
  }, [filters, pageSize]);

  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Only gates the very first load — result stays non-null (even for a zero-match filter)
  // after that, so re-filtering/re-paging keeps the existing list visible while it refetches
  // instead of blanking the whole page back to "Loading…".
  if (result === null) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-3 max-w-4xl mx-auto w-full">
        <h1 className="text-lg font-medium">Transactions</h1>
        <LoadingBlock />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-medium">Transactions</h1>
        <div className="flex gap-2">
          <Button onClick={() => router.push("/transactions/categories")}>Update categories</Button>
          <Button onClick={() => setShowAdd(true)}>+ New transaction</Button>
          <Button variant="primary" onClick={() => setShowImport((s) => !s)}>
            {showImport ? "Close import" : "Import CSV"}
          </Button>
        </div>
      </div>

      {unclassified !== null && unclassified.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-[#5A4A20] bg-nw-amber-tint px-3 py-2 text-sm text-nw-amber">
          <span className="w-1.5 h-1.5 rounded-full bg-nw-amber flex-none" />
          <span className="flex-1">
            <b className="font-medium">{unclassified.length}</b>{" "}
            {`group/item pair${unclassified.length === 1 ? "" : "s"} aren't classified as needs/wants/savings yet.`}
          </span>
          <button onClick={() => setShowClassify(true)} className="whitespace-nowrap">
            Classify Now →
          </button>
        </div>
      )}

      {showImport && (
        <ImportWizard
          onDone={() => {
            setShowImport(false);
            load();
            loadUnclassified();
          }}
          onCancel={() => setShowImport(false)}
        />
      )}

      <div className="rounded-2xl border border-nw-border bg-nw-surface p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-nw-muted font-medium">Filters</span>
          {JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS) && (
            <button onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs text-nw-mint">
              Clear all filters
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-nw-muted">From date</label>
            <input
              type="date"
              value={filters.start}
              onChange={(e) => setFilters((f) => ({ ...f, start: e.target.value }))}
              className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-nw-muted">To date</label>
            <input
              type="date"
              value={filters.end}
              onChange={(e) => setFilters((f) => ({ ...f, end: e.target.value }))}
              className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm"
            />
          </div>
          <TextField
            label="Merchant"
            placeholder="Search merchant"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
          <TextField
            label="Account"
            placeholder="Any account"
            value={filters.account_name}
            onChange={(e) => setFilters((f) => ({ ...f, account_name: e.target.value }))}
          />
          <MultiSelect
            label="Group"
            placeholder="Any group"
            options={filterOptions?.groups ?? []}
            selected={filters.group}
            onChange={(group) => setFilters((f) => ({ ...f, group }))}
          />
          <MultiSelect
            label="Item"
            placeholder="Any item"
            options={filterOptions?.items ?? []}
            selected={filters.item}
            onChange={(item) => setFilters((f) => ({ ...f, item }))}
          />
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-nw-muted">Amount range</label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Min $"
                value={filters.amount_min}
                onChange={(e) => setFilters((f) => ({ ...f, amount_min: e.target.value }))}
                className="w-full rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Max $"
                value={filters.amount_max}
                onChange={(e) => setFilters((f) => ({ ...f, amount_max: e.target.value }))}
                className="w-full rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-nw-muted">Need / want</label>
            <select
              value={filters.flow_type}
              onChange={(e) => setFilters((f) => ({ ...f, flow_type: e.target.value }))}
              className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm"
            >
              {NEED_WANT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {result?.items.length === 0 && (
        <p className="text-sm text-nw-muted">
          No transactions match. {total === 0 && "Import an EveryDollar export to see cash flow — net worth still works without it."}
        </p>
      )}

      <div className="flex flex-col">
        {result?.items.map((t) => (
          <button
            key={t.transaction_id}
            onClick={() => setEditing(t)}
            className="flex items-center justify-between gap-2 py-2 border-t border-nw-border first:border-t-0 text-sm text-left hover:bg-nw-surface"
          >
            <div className="min-w-0">
              <div className="truncate">{t.merchant || "—"}</div>
              <div className="text-xs text-nw-muted truncate">
                {formatFullDate(t.date)} · {t.group ?? "—"} {t.item ? `› ${t.item}` : ""} · {t.account_name ?? "—"}
              </div>
            </div>
            <div className={t.type === "income" ? "text-nw-green" : ""}>{money(t.amount)}</div>
          </button>
        ))}
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-nw-muted">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            {PAGE_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => setPageSize(size)}
                className={
                  "px-2 py-1 rounded-full border " +
                  (pageSize === size ? "border-nw-green-line text-nw-mint bg-nw-green-tint" : "border-nw-border")
                }
              >
                {size}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span>
              {page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total}
            </span>
            <Button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              ‹
            </Button>
            <Button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              ›
            </Button>
          </div>
        </div>
      )}

      {showClassify && unclassified && (
        <ClassifyModal
          groups={unclassified}
          onClose={() => setShowClassify(false)}
          onSaved={() => {
            setShowClassify(false);
            loadUnclassified();
          }}
        />
      )}

      {showAdd && (
        <AddTransactionModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
            loadUnclassified();
          }}
        />
      )}

      {editing && (
        <EditTransactionModal
          transaction={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            loadUnclassified();
          }}
          onDeleted={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
