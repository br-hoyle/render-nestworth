"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

export interface CalculatorNavEntry {
  key: string;
  label: string;
  group: string;
  /** Named subsection within the group (e.g. "Retirement Calculators" vs "Investment
   * Calculators") — a group is rendered as multiple side-by-side headed sections only when at
   * least one of its entries sets this; otherwise it falls back to the flat alphabetical-order
   * grid every other group already uses. Sections render left-to-right in first-seen order. */
  section?: string;
  /** 1-based column within its section — entries sharing a section+column stack top-to-bottom
   * in array order. Defaults to 1 (a section with no columns specified is one column). */
  column?: number;
}

/** Mega-menu style calculator picker — a horizontal row of section names (like a real site's
 * top nav, e.g. Money / Investing & Retirement / Real Estate), each opening a full-width panel
 * of that section's calculators below the bar. Replaces the earlier native-<select>-per-section
 * version, which read more like a form than navigation. Opens on hover OR click (desktop mouse
 * users expect hover; click is the touch-friendly fallback), closes on click-away, Escape,
 * picking an item, or the mouse leaving the whole nav+panel area. */
export function CalculatorNav({
  groups,
  calculators,
  active,
  onSelect,
}: {
  groups: string[];
  calculators: CalculatorNavEntry[];
  active: string | null;
  onSelect: (key: string) => void;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeGroup = calculators.find((c) => c.key === active)?.group;

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenGroup(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div ref={containerRef} onMouseLeave={() => setOpenGroup(null)} className="relative flex-none border-b border-nw-border bg-nw-rail">
      <nav className="flex items-center gap-1 px-3 md:px-6 h-12 overflow-x-auto">
        {groups.map((group) => {
          const isOpen = openGroup === group;
          const isActiveGroup = activeGroup === group;
          return (
            <button
              key={group}
              type="button"
              onMouseEnter={() => setOpenGroup(group)}
              onClick={() => setOpenGroup(isOpen ? null : group)}
              className={clsx(
                "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                isOpen || isActiveGroup
                  ? "border-nw-mint text-nw-mint"
                  : "border-transparent text-nw-muted hover:text-nw-text hover:border-nw-line-hi"
              )}
            >
              {group}
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                className={clsx("transition-transform", isOpen && "rotate-180")}
              >
                <path d="M1.5 3.5L5 7L8.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          );
        })}
      </nav>

      {openGroup && (
        <div className="absolute left-0 right-0 top-full z-20 border-t border-nw-border bg-nw-surface shadow-xl">
          <div className="max-w-6xl mx-auto p-4 md:p-6">
            <GroupPanel
              groupLabel={openGroup}
              entries={calculators.filter((c) => c.group === openGroup)}
              active={active}
              onSelect={(key) => {
                onSelect(key);
                setOpenGroup(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function NavLink({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "text-left text-sm py-2 px-2 -mx-2 rounded-md transition-colors",
        isActive ? "text-nw-mint bg-nw-green-tint" : "text-nw-text hover:text-nw-mint hover:bg-nw-rail"
      )}
    >
      {label}
    </button>
  );
}

function GroupPanel({
  groupLabel,
  entries,
  active,
  onSelect,
}: {
  groupLabel: string;
  entries: CalculatorNavEntry[];
  active: string | null;
  onSelect: (key: string) => void;
}) {
  // A group renders as a columned grid whenever any entry sets `section` or `column` — named
  // sections (Retirement Calculators / Investment Calculators) get header rows; a group that
  // only sets `column` (no section names at all, e.g. Housing & Mortgage's plain 3-column
  // down-then-over layout) renders the same flattened column grid with no header row, instead
  // of the alphabetical-order flat grid below.
  const hasColumns = entries.some((e) => e.section || e.column);

  if (!hasColumns) {
    return (
      <>
        <div className="text-[10px] uppercase tracking-wider text-nw-muted mb-3">{groupLabel}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1">
          {entries.map((c) => (
            <NavLink key={c.key} label={c.label} isActive={active === c.key} onClick={() => onSelect(c.key)} />
          ))}
        </div>
      </>
    );
  }

  // Group entries into sections (first-seen order), then into columns within each section
  // (first-seen order, defaulting to column 1) — this produces the "Retirement Calculators" /
  // "Investment Calculators" side-by-side headed column groups, each internally split further.
  const sectionOrder: string[] = [];
  const sections = new Map<string, Map<number, CalculatorNavEntry[]>>();
  for (const entry of entries) {
    const section = entry.section ?? "";
    if (!sections.has(section)) {
      sections.set(section, new Map());
      sectionOrder.push(section);
    }
    const columns = sections.get(section)!;
    const col = entry.column ?? 1;
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col)!.push(entry);
  }

  // Flatten to one ordered list of columns-per-section, so every column across every section
  // becomes a single flat grid track — this is what makes a 2-column section and another
  // 2-column section land as 4 columns in one row instead of stacking as two separate blocks.
  const sectionBlocks = sectionOrder.map((section) => {
    const columns = sections.get(section)!;
    const columnKeys = [...columns.keys()].sort((a, b) => a - b);
    return { section, columns: columnKeys.map((k) => columns.get(k)!) };
  });
  const totalColumns = sectionBlocks.reduce((sum, b) => sum + b.columns.length, 0);

  return (
    <div className="grid gap-x-8 gap-y-2" style={{ gridTemplateColumns: `repeat(${totalColumns}, minmax(220px, 1fr))` }}>
      {sectionBlocks.map(
        (block) =>
          block.section && (
            <div
              key={block.section}
              className="text-[10px] uppercase tracking-wider text-nw-muted"
              style={{ gridColumn: `span ${block.columns.length}` }}
            >
              {block.section}
            </div>
          )
      )}
      {sectionBlocks.flatMap((block, bi) =>
        block.columns.map((columnEntries, ci) => (
          <div key={`${block.section}-${bi}-${ci}`} className="flex flex-col gap-0.5">
            {columnEntries.map((c) => (
              <NavLink key={c.key} label={c.label} isActive={active === c.key} onClick={() => onSelect(c.key)} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
