"use client";

import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { ImportPreviewResponse, PreviewRow } from "@/lib/types";
import { formatFullDate } from "@/lib/format";
import { Button } from "@/components/ui/Button";

type Step = "upload" | "mapping" | "preview" | "done";

const EXPECTED_COLUMNS = ["Group", "Item", "Type", "Date", "Merchant", "Account", "Amount", "Note"];

function downloadErrorsCsv(preview: ImportPreviewResponse) {
  const headers = Object.keys(preview.errors[0]?.raw ?? {});
  const lines = [
    [...headers, "error_reason"].join(","),
    ...preview.errors.map((e) => [...headers.map((h) => `"${(e.raw[h] ?? "").replace(/"/g, '""')}"`), `"${e.reason}"`].join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "import-errors.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportWizard({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [committed, setCommitted] = useState<{ inserted: number; sourceFile: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"all" | "new" | "dupes" | "errors">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function runPreview(f: File, columnMapping?: Record<string, string>) {
    setError(null);
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", f);
      if (columnMapping) formData.append("column_mapping", JSON.stringify(columnMapping));
      const res = await api.upload<ImportPreviewResponse>("/transactions/import/preview", formData);
      if (res.needs_mapping) {
        setPreview(res);
        setStep("mapping");
      } else {
        setPreview(res);
        setStep("preview");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  function handleFileChange(f: File | null) {
    setFile(f);
    if (f) runPreview(f);
  }

  async function handleMappingSubmit() {
    if (!file) return;
    await runPreview(file, mapping);
  }

  async function handleCommit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ inserted_count: number; source_file: string }>(
        "/transactions/import/commit",
        { source_file: preview.source_file, rows: preview.new_rows }
      );
      setCommitted({ inserted: res.inserted_count, sourceFile: res.source_file });
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo() {
    if (!committed) return;
    setBusy(true);
    try {
      await api.delete(`/transactions/import/${encodeURIComponent(committed.sourceFile)}`);
      reset();
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not undo.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setCommitted(null);
    setMapping({});
    setError(null);
  }

  const visibleRows: (PreviewRow & { status: "new" | "dupe" })[] =
    preview
      ? [
          ...preview.new_rows.map((r) => ({ ...r, status: "new" as const })),
          ...preview.duplicate_rows.map((r) => ({ ...r, status: "dupe" as const })),
        ].sort((a, b) => a.row_number - b.row_number)
      : [];

  const filteredRows =
    tab === "new" ? visibleRows.filter((r) => r.status === "new") : tab === "dupes" ? visibleRows.filter((r) => r.status === "dupe") : visibleRows;

  return (
    <div className="rounded-lg border border-nw-border bg-nw-rail p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Import transactions</h2>
        <div className="flex items-center gap-2 text-xs text-nw-muted">
          <StepDot active={step === "upload" || step === "mapping"} done={step === "preview" || step === "done"} />
          Upload
          <StepDot active={step === "preview"} done={step === "done"} />
          Preview
          <StepDot active={step === "done"} done={false} />
          Confirm
          <button onClick={onCancel} className="ml-2 text-nw-muted">✕</button>
        </div>
      </div>

      {error && <p className="text-xs text-nw-coral">{error}</p>}

      {step === "upload" && (
        <div
          className="rounded-lg border border-dashed border-nw-green-line bg-nw-surface p-8 text-center text-nw-mint flex flex-col items-center gap-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFileChange(f);
          }}
        >
          <span className="text-2xl">↑</span>
          <p className="text-sm">Drop an EveryDollar export, or use the file picker</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          <Button variant="primary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            {busy ? "Reading…" : "Choose file"}
          </Button>
        </div>
      )}

      {step === "mapping" && preview && (
        <div className="rounded-lg border border-nw-border bg-nw-surface p-4 flex flex-col gap-3">
          <p className="text-sm text-nw-muted">
            This file&apos;s headers don&apos;t match the expected EveryDollar format. Map each
            expected column to one from your file.
          </p>
          {EXPECTED_COLUMNS.map((col) => (
            <div key={col} className="flex items-center gap-3">
              <span className="w-24 text-xs text-nw-muted">{col}</span>
              <select
                value={mapping[col] ?? ""}
                onChange={(e) => setMapping((m) => ({ ...m, [col]: e.target.value }))}
                className="flex-1 rounded-md border border-nw-border bg-nw-rail px-3 py-1.5 text-sm"
              >
                <option value="">— select —</option>
                {preview.detected_headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="flex gap-2 justify-end">
            <Button onClick={reset}>Cancel</Button>
            <Button variant="primary" onClick={handleMappingSubmit} disabled={busy}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-nw-border bg-nw-surface p-2">
              <div className="text-[10px] uppercase text-nw-muted">New</div>
              <div className="text-lg text-nw-green">{preview.new_rows.length}</div>
            </div>
            <div className="rounded-md border border-nw-border bg-nw-surface p-2">
              <div className="text-[10px] uppercase text-nw-muted">Duplicates</div>
              <div className="text-lg">{preview.duplicate_rows.length}</div>
            </div>
            <div className="rounded-md border border-nw-border bg-nw-surface p-2">
              <div className="text-[10px] uppercase text-nw-muted">Errors</div>
              <div className="text-lg text-nw-coral">{preview.errors.length}</div>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {(["all", "new", "dupes", "errors"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  "px-3 py-1 rounded-full text-xs border capitalize " +
                  (tab === t ? "border-nw-green-line text-nw-mint bg-nw-green-tint" : "border-nw-border text-nw-muted")
                }
              >
                {t} {t === "errors" ? `(${preview.errors.length})` : ""}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1 max-h-80 overflow-auto">
            {tab !== "errors" &&
              filteredRows.map((r) => (
                <div
                  key={r.fingerprint + r.row_number}
                  className={
                    "flex items-center justify-between text-xs rounded-md border border-nw-border px-3 py-2 " +
                    (r.status === "dupe" ? "opacity-45" : "")
                  }
                >
                  <span>{r.status === "dupe" ? "⊘" : "✓"}</span>
                  <span className="flex-1 px-2 truncate">{r.merchant}</span>
                  <span className="w-28 text-nw-muted whitespace-nowrap">{formatFullDate(r.date)}</span>
                  <span className={r.type === "income" ? "text-nw-green" : ""}>{r.amount}</span>
                </div>
              ))}
            {tab === "errors" &&
              preview.errors.map((e) => (
                <div key={e.row_number} className="flex items-center justify-between text-xs rounded-md border border-[#5A3228] px-3 py-2 text-nw-coral">
                  <span>Row {e.row_number}</span>
                  <span className="flex-1 px-2">{e.reason}</span>
                </div>
              ))}
          </div>

          {preview.errors.length > 0 && (
            <button onClick={() => downloadErrorsCsv(preview)} className="text-xs text-nw-mint self-start">
              Download error rows as a corrected re-upload CSV
            </button>
          )}

          <p className="text-xs text-nw-muted">Nothing has been written yet.</p>
          <div className="flex gap-2 justify-end">
            <Button onClick={reset}>Cancel</Button>
            <Button variant="primary" onClick={handleCommit} disabled={busy || preview.new_rows.length === 0}>
              {busy ? "Importing…" : `Import ${preview.new_rows.length}`}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && committed && (
        <div className="rounded-lg border border-nw-green-line bg-nw-green-tint p-4 flex flex-col gap-3 text-nw-mint">
          <p className="text-sm">Imported {committed.inserted} transactions.</p>
          <div className="flex gap-2">
            <Button onClick={handleUndo} disabled={busy}>
              Undo this import
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onDone();
              }}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <span
      className={
        "w-3.5 h-3.5 rounded-full border flex items-center justify-center " +
        (active || done ? "border-nw-green text-nw-green" : "border-nw-line-hi")
      }
    />
  );
}
