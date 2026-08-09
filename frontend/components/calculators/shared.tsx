"use client";

import { useId, useState } from "react";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { money } from "@/lib/format";

/** Formats a dollar-amount field's value with thousands commas when the field isn't focused
 * (e.g. "80,000"), showing the raw digits while the user is actively typing so commas don't
 * fight the cursor mid-edit. */
function formatDollarDisplay(value: number): string {
  if (Number.isNaN(value)) return "";
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function NumField({
  label,
  value,
  onChange,
  step,
  percent,
  prefix,
  chips,
  helper,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  /** True for rate-like fields whose underlying value is a fraction (0.065) — displays and
   * accepts a percent number (6.5) instead, converting on the way in/out. */
  percent?: boolean;
  /** Affixed inside the box, e.g. "$" — mirrors the mockup's boxed money-input look. */
  prefix?: string;
  /** Quick-add amounts rendered as chips below the field (e.g. [100, 250, 500] -> "+$100"),
   * adding to whatever's currently entered — only meaningful for dollar-amount fields. */
  chips?: number[];
  /** Short assumption/guidance text rendered below the field (and below chips, if present). */
  helper?: string;
}) {
  // Round away floating-point dust (0.07 * 100 === 7.000000000000001) while still allowing
  // genuine fractional percents like 6.375.
  const displayValue = percent ? Math.round(value * 100 * 1e6) / 1e6 : Math.round(value);
  const displayStr = Number.isNaN(displayValue) ? "" : String(displayValue);
  const inputId = useId();
  const [focused, setFocused] = useState(false);
  const isDollar = !!prefix && !percent;

  function handleChange(raw: string) {
    if (raw === "") {
      onChange(NaN);
      return;
    }
    const cleaned = isDollar ? raw.replace(/,/g, "") : raw;
    if (isDollar && !/^-?\d*\.?\d*$/.test(cleaned)) return; // ignore stray non-numeric keystrokes
    const n = Number(cleaned);
    if (Number.isNaN(n)) return;
    onChange(percent ? n / 100 : isDollar ? n : Math.round(n));
  }

  if (!prefix && !chips && !helper) {
    // No boxed-affix styling needed — keep the plain TextField (unchanged look) for the many
    // calculators that don't use these new mockup-driven touches.
    return (
      <TextField
        label={percent ? `${label} (%)` : label}
        type="number"
        step={percent ? "0.1" : step ?? "1"}
        value={displayStr}
        onChange={(e) => handleChange(e.target.value)}
      />
    );
  }

  const dollarDisplayStr = Number.isNaN(value) ? "" : focused ? String(value) : formatDollarDisplay(value);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-[11px] uppercase tracking-wide text-nw-muted whitespace-nowrap overflow-hidden text-ellipsis">
        {percent ? `${label} (%)` : label}
      </label>
      <div className="flex items-center gap-1 rounded-md border border-nw-border bg-nw-rail px-3 focus-within:border-nw-green-line">
        {prefix && <span className="text-nw-muted text-sm">{prefix}</span>}
        <input
          id={inputId}
          type={isDollar ? "text" : "number"}
          inputMode={isDollar ? "decimal" : undefined}
          step={percent ? "0.1" : step ?? "1"}
          value={isDollar ? dollarDisplayStr : displayStr}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => handleChange(e.target.value)}
          className="flex-1 min-w-0 bg-transparent py-2 text-sm text-nw-text placeholder:text-nw-muted focus:outline-none"
        />
        {percent && <span className="text-nw-muted text-sm">%</span>}
      </div>
      {chips && chips.length > 0 && (
        <div className="flex gap-1.5 flex-wrap pt-0.5">
          {chips.map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => onChange((Number.isNaN(value) ? 0 : value) + amt)}
              className="px-2.5 py-1 rounded-full text-xs border border-nw-green-line text-nw-mint bg-nw-green-tint hover:bg-nw-green-line/60 transition-colors"
            >
              +{fmtMoney(amt)}
            </button>
          ))}
        </div>
      )}
      {helper && <p className="text-[11px] text-nw-muted leading-snug pt-0.5">{helper}</p>}
    </div>
  );
}

export interface AmountOrPercent {
  value: number;
  isPercent: boolean;
}

/** A cost field that can be quoted either as a flat dollar amount or as a percentage (of home
 * price, typically — the caller decides what the percent is relative to) — property tax, home
 * insurance, PMI, HOA, and similar Housing & Mortgage inputs all use this "% or $" toggle rather
 * than being locked to one or the other, matching calculator.net's convention. Switching modes
 * resets the raw number rather than trying to convert it, since a dollar figure and a percent
 * figure aren't the same kind of number — the household re-enters whichever they meant. */
export function AmountOrPercentField({
  label,
  value,
  onChange,
  helper,
}: {
  label: string;
  value: AmountOrPercent;
  onChange: (v: AmountOrPercent) => void;
  helper?: string;
}) {
  const inputId = useId();
  const displayValue = value.isPercent
    ? Math.round(value.value * 100 * 1e6) / 1e6
    : Math.round(value.value * 100) / 100;
  const displayStr = Number.isNaN(displayValue) ? "" : String(displayValue);

  function handleChange(raw: string) {
    if (raw === "") {
      onChange({ ...value, value: NaN });
      return;
    }
    const n = Number(raw);
    onChange({ ...value, value: value.isPercent ? n / 100 : n });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-[11px] uppercase tracking-wide text-nw-muted">
          {label}
        </label>
        <div className="flex rounded-full border border-nw-border overflow-hidden text-[10px] shrink-0">
          <button
            type="button"
            onClick={() => onChange({ value: 0, isPercent: false })}
            className={"px-2 py-0.5 transition-colors " + (!value.isPercent ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
          >
            $
          </button>
          <button
            type="button"
            onClick={() => onChange({ value: 0, isPercent: true })}
            className={"px-2 py-0.5 transition-colors " + (value.isPercent ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
          >
            %
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1 rounded-md border border-nw-border bg-nw-rail px-3 focus-within:border-nw-green-line">
        {!value.isPercent && <span className="text-nw-muted text-sm">$</span>}
        <input
          id={inputId}
          type="number"
          step="0.01"
          value={displayStr}
          onChange={(e) => handleChange(e.target.value)}
          className="flex-1 min-w-0 bg-transparent py-2 text-sm text-nw-text placeholder:text-nw-muted focus:outline-none"
        />
        {value.isPercent && <span className="text-nw-muted text-sm">%</span>}
      </div>
      {helper && <p className="text-[11px] text-nw-muted leading-snug pt-0.5">{helper}</p>}
    </div>
  );
}

/** Labeled <select> matching the app's boxed input styling — used throughout Housing &
 * Mortgage's bespoke components (repayment option, DTI preset, tax filing status, etc.) instead
 * of repeating the same label+select markup in every component. */
export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-nw-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm text-nw-text"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ResultTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-nw-border bg-nw-surface p-2 flex-1 min-w-[110px]">
      <div className="text-[10px] uppercase text-nw-muted">{label}</div>
      <div className="text-base">{value}</div>
    </div>
  );
}

/** Title + one-paragraph "what this does / how to read it" copy, rendered above a
 * calculator's inputs — every calculator gets one of these now, not just a bare formula box. */
export function CalcCopy({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-base font-medium">{title}</h2>
      <p className="text-xs text-nw-muted leading-relaxed">{description}</p>
    </div>
  );
}

/** The primary, full-width "Calculate" button every calculator now has — filled rather than
 * outlined, for visual weight matching the mockup, distinct from the app's default outlined
 * Button component used for secondary actions elsewhere. */
export function CalcButton({
  onClick,
  loading,
  children = "Calculate",
}: {
  onClick: () => void;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full rounded-md bg-nw-green py-3 text-sm font-semibold text-nw-bg hover:bg-nw-green-deep disabled:opacity-60 transition-colors"
    >
      {loading ? "Calculating…" : children}
    </button>
  );
}

/** Sub-tab switcher for multi-mode calculators (Retirement's 4 modes, Investment's 3
 * solve-for modes) — pill-style, matching the range-selector pattern used on Overview/Scorecard. */
export function CalcTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 border-b border-nw-border pb-3">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={
            "px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition-colors " +
            (active === t.key
              ? "border-nw-green-line text-nw-mint bg-nw-green-tint"
              : "border-nw-border text-nw-muted hover:text-nw-text")
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function fmtMoney(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return money(Number(v));
}

/** Two-column desktop layout (inputs left, results right, stacking on mobile) — replaces the
 * old narrow-sidebar-plus-flex-1 shape, which stacked every input in a single tall column and
 * pushed the Calculate button (and all of the results) below the fold on most calculators.
 * Putting inputs in a responsive grid (see CalcFieldGrid) and results alongside them instead
 * of below keeps the whole calculator — inputs, button, and results — visible without
 * scrolling on typical desktop viewports. */
export function CalcLayout({ inputs, results }: { inputs: React.ReactNode; results: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <div className="flex flex-col gap-3">{inputs}</div>
      <div className="rounded-lg border border-nw-border bg-nw-surface p-4 min-h-[320px] flex flex-col">{results}</div>
    </div>
  );
}

/** Field grid — one column on mobile, two from `sm` up, three from `xl` up on wide desktop
 * monitors (where CalcLayout's own two-column split still leaves enough room per side).
 * Halves (or thirds) the vertical height of a typical input column versus stacking every
 * field one-per-row — the main lever for keeping the Calculate button and results above the
 * fold on the calculators with the most fields (Retirement Need, 401(k)). Wrap a field in a
 * `sm:col-span-2 xl:col-span-1` div to let it span the full width on medium screens only, or
 * `sm:col-span-2 xl:col-span-3` to always span full width regardless of column count (selects,
 * debt-list rows, anything with long helper text). */
export function CalcFieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{children}</div>;
}

/** A single row of inputs with an exact, spec-driven column arrangement — unlike CalcFieldGrid's
 * auto-flowing grid, each row is authored explicitly (e.g. "Current Age | Retirement Age | Life
 * Expectancy" on one row, "Current Retirement Savings" alone on the next). `items-start` keeps
 * every label — and therefore the input directly below it — level with its neighbors regardless
 * of how much helper text follows underneath in any one column; bottom-aligning instead would
 * drag a shorter column's whole label+input down to match a taller sibling's helper text, which
 * misaligns the very thing this is meant to keep level. Since the row is always a full-width
 * flex container regardless of how many fields it holds, every row spans the same total width
 * even though individual fields within a row don't have to match each other's width (see
 * CalcCol's `grow`). */
export function CalcRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-start gap-3 w-full">{children}</div>;
}

/** A field's column within a CalcRow — `grow` controls its share of the row's width relative to
 * its siblings (default 1, so a row of plain <CalcCol> children splits evenly); pass a bigger
 * number for a field that should take up more of the row than the others. */
export function CalcCol({ children, grow = 1 }: { children: React.ReactNode; grow?: number }) {
  return (
    <div className="min-w-0" style={{ flexGrow: grow, flexBasis: 0 }}>
      {children}
    </div>
  );
}

/** Collapsed-by-default "Optional Inputs" section — used for fields most households can leave
 * at their default (Other Income After Retirement, Compound Frequency, etc.) so the primary
 * inputs aren't crowded by rarely-changed ones. */
export function CalcOptionalSection({
  title = "Optional Inputs",
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-nw-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wide text-nw-muted hover:text-nw-text transition-colors"
      >
        {title}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={open ? "rotate-180" : undefined}>
          <path d="M1.5 3.5L5 7L8.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="flex flex-col gap-3 p-3 pt-0">{children}</div>}
    </div>
  );
}

/** Prominent "here's your answer, in plain English" banner — the goal for every calculator's
 * result is to make the takeaway sentence obvious rather than leaving the household to piece it
 * together from a row of tiles (e.g. "You need to contribute $X/mo to hit your $Y nest egg by
 * age Z."). */
export function CalcAnswer({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-nw-green-line bg-nw-green-tint p-3 text-sm text-nw-mint font-medium leading-snug">
      {children}
    </div>
  );
}

/** Chart/Table pill switch for results that can be viewed either way — the schedule data behind
 * a chart is inherently tabular, so anywhere a schedule chart already exists, offer the table as
 * an alternate view instead of always showing both at once. */
export function CalcViewToggle({
  view,
  onChange,
}: {
  view: "chart" | "table";
  onChange: (v: "chart" | "table") => void;
}) {
  return (
    <div className="flex gap-1.5 self-end">
      {(["chart", "table"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={
            "px-2.5 py-1 rounded-full text-[11px] capitalize border transition-colors " +
            (view === v ? "border-nw-green-line text-nw-mint bg-nw-green-tint" : "border-nw-border text-nw-muted hover:text-nw-text")
          }
        >
          {v}
        </button>
      ))}
    </div>
  );
}

export interface ScheduleTableColumn {
  key: string;
  label: string;
  format?: "money" | "percent" | "number";
}

/** Generic tabular view of a schedule array — the table counterpart to a schedule line/area
 * chart, toggled via CalcViewToggle instead of always showing both. */
export function ScheduleTable({ rows, columns }: { rows: Record<string, unknown>[]; columns: ScheduleTableColumn[] }) {
  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface overflow-x-auto max-h-[280px] overflow-y-auto">
      <table className="text-xs w-full min-w-max border-collapse">
        <thead className="sticky top-0 bg-nw-surface">
          <tr className="text-nw-muted text-left">
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 font-normal whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-nw-border">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-1.5 whitespace-nowrap">
                  {c.format === "money"
                    ? fmtMoney(row[c.key])
                    : c.format === "percent"
                      ? `${Number(row[c.key]).toFixed(2)}%`
                      : String(row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface DebtTableRow {
  name: string;
  balance: number;
  annual_rate: number;
  /** Backend field names for "minimum monthly payment" differ across calculators (debt payoff
   * vs. debt consolidation) — kept as one neutral key here, with each caller mapping it to
   * whatever its own API payload expects. */
  payment: number;
}

/** Shared multi-debt input table (Debt Payoff, Debt Consolidation) — a free-form list of debts,
 * each with a name, balance, interest rate, and minimum monthly payment, with add/remove rows. */
export function DebtTable({
  rows,
  onChange,
  paymentLabel = "Minimum Monthly Payment",
}: {
  rows: DebtTableRow[];
  onChange: (rows: DebtTableRow[]) => void;
  paymentLabel?: string;
}) {
  function update(i: number, patch: Partial<DebtTableRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-wide text-nw-muted">Debts</div>
      {rows.map((debt, i) => (
        <div key={i} className="rounded-md border border-nw-border p-2 flex flex-col gap-1.5">
          <input
            type="text"
            placeholder="Debt name"
            value={debt.name}
            onChange={(e) => update(i, { name: e.target.value })}
            className="rounded-md border border-nw-border bg-nw-rail px-3 py-1.5 text-sm text-nw-text placeholder:text-nw-muted"
          />
          <CalcRow>
            <CalcCol>
              <NumField label="Balance" prefix="$" value={debt.balance} onChange={(v) => update(i, { balance: v })} />
            </CalcCol>
            <CalcCol>
              <NumField label="Interest Rate" percent value={debt.annual_rate} onChange={(v) => update(i, { annual_rate: v })} />
            </CalcCol>
            <CalcCol>
              <NumField label={paymentLabel} prefix="$" value={debt.payment} onChange={(v) => update(i, { payment: v })} />
            </CalcCol>
          </CalcRow>
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              className="text-[10px] text-nw-coral self-start"
            >
              Remove debt
            </button>
          )}
        </div>
      ))}
      <Button onClick={() => onChange([...rows, { name: "", balance: 5000, annual_rate: 0.18, payment: 150 }])}>+ Add debt</Button>
    </div>
  );
}

/** Centered "no results yet" placeholder for CalcLayout's results panel — centered both
 * vertically and horizontally within the panel, not just left-aligned at the top. */
export function CalcEmptyState({
  children = "Enter your numbers and press Calculate to see results.",
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex items-center justify-center text-center px-6">
      <p className="text-xs text-nw-muted">{children}</p>
    </div>
  );
}
