"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DeleteHouseholdModal({
  householdName,
  onClose,
  onDeleted,
}: {
  householdName: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim().toLowerCase() === "delete";

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      // Download a copy of everything before it's gone — the delete below is irreversible.
      const [balancesCsv, transactionsCsv] = await Promise.all([
        api.getBlob("/balances/export.csv"),
        api.getBlob("/transactions/export.csv"),
      ]);
      downloadBlob(balancesCsv, "nestworth-balances.csv");
      downloadBlob(transactionsCsv, "nestworth-transactions.csv");

      await api.delete("/settings/household");
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Nothing was deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-lg border border-[#5A3228] bg-nw-surface p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-nw-coral">Delete household</h2>
          <button onClick={onClose} className="text-nw-muted text-xs">✕</button>
        </div>
        <p className="text-xs text-nw-muted leading-relaxed">
          This permanently deletes <b>{householdName}</b> and everything in it — every account,
          balance, transaction, income record, and saved scenario. <b>This cannot be undone.</b>{" "}
          Before anything is deleted, a CSV copy of your account balances and transactions will
          download automatically.
        </p>
        <TextField
          label='Type "delete" to confirm'
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
        />
        {error && <p className="text-xs text-nw-coral">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!canDelete || deleting} onClick={handleDelete}>
            {deleting ? "Deleting…" : "Delete household"}
          </Button>
        </div>
      </div>
    </div>
  );
}
