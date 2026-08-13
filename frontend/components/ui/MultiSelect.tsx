"use client";

import { useEffect, useRef, useState } from "react";

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "All",
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const filteredOptions = search ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase())) : options;

  function toggle(option: string) {
    onChange(selected.includes(option) ? selected.filter((s) => s !== option) : [...selected, option]);
  }

  const summary = selected.length === 0 ? placeholder : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <div className="flex flex-col gap-1 relative" ref={rootRef}>
      <label className="text-[11px] uppercase tracking-wide text-nw-muted">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm text-left truncate flex items-center justify-between gap-1"
      >
        <span className={selected.length === 0 ? "text-nw-muted truncate" : "truncate"}>{summary}</span>
        <span className="text-nw-muted flex-none">▾</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 max-w-[80vw] rounded-md border border-nw-border bg-nw-surface shadow-lg z-20 flex flex-col">
          {options.length > 8 && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="m-1.5 rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-xs"
              autoFocus
            />
          )}
          <div className="max-h-56 overflow-y-auto flex flex-col p-1">
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-left px-2 py-1 text-xs text-nw-mint hover:bg-nw-rail rounded"
              >
                Clear selection
              </button>
            )}
            {filteredOptions.length === 0 && <p className="px-2 py-1 text-xs text-nw-muted">No matches.</p>}
            {filteredOptions.map((option) => (
              <label key={option} className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-nw-rail cursor-pointer">
                <input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} className="accent-[var(--nw-green)]" />
                <span className="truncate">{option}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
