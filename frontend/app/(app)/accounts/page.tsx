"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Account } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { AccountForm, AccountFormValues } from "@/components/forms/AccountForm";

type Filter = "active" | "closed" | "all";

function money(v: string | null) {
  if (v === null) return "—";
  const n = Number(v);
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function AccountsPage() {
  const [filter, setFilter] = useState<Filter>("active");
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [panel, setPanel] = useState<null | "create" | Account>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await api.get<Account[]>(`/accounts?filter=${filter}`);
    setAccounts(data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const grouped = (accounts ?? []).reduce<Record<string, Account[]>>((acc, a) => {
    (acc[a.category] ??= []).push(a);
    return acc;
  }, {});

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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not close account.");
    }
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-medium">Accounts</h1>
        <Button variant="primary" onClick={() => setPanel("create")}>
          + New account
        </Button>
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
          {accounts === null && <p className="text-sm text-nw-muted">Loading…</p>}
          {accounts?.length === 0 && (
            <p className="text-sm text-nw-muted">
              No accounts yet. Add your first account, or import history from a CSV.
            </p>
          )}
          {Object.entries(grouped).map(([category, list]) => (
            <div key={category} className="flex flex-col gap-1">
              <div className="text-[10px] uppercase tracking-wide text-nw-muted px-1">
                {category}
              </div>
              {list.map((a) => (
                <button
                  key={a.account_id}
                  onClick={() => setPanel(a)}
                  className="flex items-center justify-between gap-2 rounded-md border border-nw-border bg-nw-surface px-3 py-2 text-left text-sm hover:border-nw-line-hi"
                >
                  <div className="min-w-0">
                    <div className="truncate">
                      {a.account_name} {!a.is_open && <span className="text-nw-muted text-xs">closed</span>}
                    </div>
                    <div className="text-xs text-nw-muted truncate">
                      {a.institution_name} · {a.account_type}
                    </div>
                  </div>
                  <div className={a.balance_type === "liability" ? "text-nw-coral" : ""}>
                    {a.balance_type === "liability" && a.latest_balance ? "−" : ""}
                    {money(a.latest_balance)}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>

        {panel && (
          <div className="w-full md:w-[300px] flex-none rounded-lg border border-nw-border bg-nw-rail p-3">
            {panel === "create" ? (
              <AccountForm
                startDateLabel="Effective start date"
                submitLabel="Create account"
                onSubmit={handleCreate}
                onCancel={() => setPanel(null)}
                onClose={() => setPanel(null)}
              />
            ) : (
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
            )}
            {panel !== "create" && panel.is_open && (
              <button
                onClick={() => handleClose(panel)}
                className="mt-3 text-xs text-nw-coral"
              >
                Close account…
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
