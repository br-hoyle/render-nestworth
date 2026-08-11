"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { TransactionRecord } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Modal } from "@/components/ui/Modal";

export function EditTransactionModal({
  transaction,
  onClose,
  onSaved,
  onDeleted,
}: {
  transaction: TransactionRecord;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState({
    date: transaction.date,
    group: transaction.group ?? "",
    item: transaction.item ?? "",
    type: transaction.type,
    merchant: transaction.merchant ?? "",
    account_name: transaction.account_name ?? "",
    amount: transaction.amount,
    note: transaction.note ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/transactions/${transaction.transaction_id}`, {
        date: form.date,
        group: form.group,
        item: form.item,
        type: form.type,
        merchant: form.merchant,
        account_name: form.account_name,
        amount: Number(form.amount),
        note: form.note,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this transaction?")) return;
    setDeleting(true);
    try {
      await api.delete(`/transactions/${transaction.transaction_id}`);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal onClose={onClose} className="w-full max-w-sm rounded-lg border border-nw-border bg-nw-surface p-4 flex flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Edit transaction</h2>
          <button type="button" onClick={onClose} className="text-nw-muted text-xs">✕</button>
        </div>
        <TextField label="Date" type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
        <TextField label="Merchant" value={form.merchant} onChange={(e) => update("merchant", e.target.value)} />
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <TextField label="Group" value={form.group} onChange={(e) => update("group", e.target.value)} />
          </div>
          <div className="flex-1 min-w-0">
            <TextField label="Item" value={form.item} onChange={(e) => update("item", e.target.value)} />
          </div>
        </div>
        <TextField label="Account name" value={form.account_name} onChange={(e) => update("account_name", e.target.value)} />
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <label className="text-[11px] uppercase tracking-wide text-nw-muted">Type</label>
            <select
              value={form.type}
              onChange={(e) => update("type", e.target.value)}
              className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm"
            >
              <option value="income">income</option>
              <option value="expense">expense</option>
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <TextField label="Amount" type="number" step="0.01" value={form.amount} onChange={(e) => update("amount", e.target.value)} />
          </div>
        </div>
        <TextField label="Note" value={form.note} onChange={(e) => update("note", e.target.value)} />
        {error && <p className="text-xs text-nw-coral">{error}</p>}
        <div className="flex gap-2 justify-between">
          <Button type="button" variant="danger" disabled={deleting} onClick={remove}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
