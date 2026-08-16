"use client";

import { useMemo, useRef, useState } from "react";
import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import type { TransactionRecord } from "@/lib/types";
import { money, titleCase } from "@/lib/format";
import { chartColorForIndex } from "@/lib/chartColors";
import { Modal } from "@/components/ui/Modal";

// Income-side nodes always read as one consistent color; each top-level spending group gets
// its own color (from the shared categorical chart palette) and every node/link under that
// group — including its "Group · Item" leaves — inherits it, so a whole branch reads as one
// color family.
const INCOME_COLOR = "var(--nw-green)";

const SANKEY_MARGIN = 10;

interface SankeyNodePayload {
  name: string;
  value: number;
}

interface SankeyLinkPayload {
  source: SankeyNodePayload;
  target: SankeyNodePayload;
}

const TOTAL_INCOME = "Total Income";
const SAVINGS = "Savings";
// Named but rendered as nothing (see renderNode) — its only purpose is an extra depth column,
// so "Total income" has breathing room before the expense/savings branches fan out, instead of
// its label sitting right on top of them.
const SPACER = " spacer";

// Number of distinct calendar months spanned by [start, end], inclusive — the divisor for
// "Average Monthly" mode. Matches how the Cash Flow page's own range picker thinks about
// months (a partial month still counts as one).
function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
}

// Only the expanded group's items are added as leaf nodes — with every group's full item
// breakdown on screen at once (the old behavior), a household with a handful of groups and a
// few items each renders 30-50+ overlapping leaf nodes and reads as noise. Showing groups
// only, with a click to drill into one group's items, keeps the chart legible at any data
// volume; `expandedGroup` is which one (if any) is currently drilled into.
function buildSankeyData(transactions: TransactionRecord[], expandedGroup: string | null, divisor: number) {
  const nodeIndex = new Map<string, number>();
  const nodes: { name: string }[] = [];
  const linkAmounts = new Map<string, number>();
  const colorByName = new Map<string, string>();
  const middleTierNames = new Set<string>(); // group-level nodes render their label to the left
  const expandableGroupNames = new Set<string>(); // expense groups — clickable to drill in
  const groupColor = new Map<string, string>();
  let paletteIdx = 0;

  function colorForGroup(group: string): string {
    if (!groupColor.has(group)) {
      groupColor.set(group, chartColorForIndex(paletteIdx));
      paletteIdx++;
    }
    return groupColor.get(group)!;
  }

  function nodeFor(name: string, color: string): number {
    if (!nodeIndex.has(name)) {
      nodeIndex.set(name, nodes.length);
      nodes.push({ name });
      colorByName.set(name, color);
    }
    return nodeIndex.get(name)!;
  }

  function addLink(source: number, target: number, amount: number) {
    if (amount <= 0) return;
    const key = `${source}->${target}`;
    linkAmounts.set(key, (linkAmounts.get(key) ?? 0) + amount);
  }

  // Pass 1 — aggregate raw totals only, so nodes can be created in biggest-to-smallest order
  // (insertion order is what drives recharts' top-to-bottom stacking within a column; it doesn't
  // sort by value itself).
  const incomeBucketTotals = new Map<string, number>();
  const groupTotals = new Map<string, number>();
  const itemTotalsByGroup = new Map<string, Map<string, number>>();
  let totalIncome = 0;
  let totalExpense = 0;

  for (const t of transactions) {
    if (t.type === "income") {
      // Signed, not abs — matches the Cash Flow tile's income total so this diagram's
      // percentages are computed off the same denominator as the "Savings Rate" tile.
      const amount = Number(t.amount);
      totalIncome += amount;
      const bucket = titleCase(t.item || t.group || t.merchant || "Other income");
      incomeBucketTotals.set(bucket, (incomeBucketTotals.get(bucket) ?? 0) + amount);
    } else {
      const amount = Math.abs(Number(t.amount));
      totalExpense += amount;
      const group = titleCase(t.group || "Other");
      const item = titleCase(t.item || "Other");
      groupTotals.set(group, (groupTotals.get(group) ?? 0) + amount);
      if (!itemTotalsByGroup.has(group)) itemTotalsByGroup.set(group, new Map());
      const itemTotals = itemTotalsByGroup.get(group)!;
      itemTotals.set(item, (itemTotals.get(item) ?? 0) + amount);
    }
  }

  const sortedByValueDesc = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);

  // Pass 2 — build nodes/links in that sorted order.
  for (const [bucket, amount] of sortedByValueDesc(incomeBucketTotals)) {
    addLink(nodeFor(bucket, INCOME_COLOR), nodeFor(TOTAL_INCOME, INCOME_COLOR), amount);
  }

  const totalIncomeIdx = nodeFor(TOTAL_INCOME, INCOME_COLOR);
  const spacerIdx = nodeFor(SPACER, INCOME_COLOR);
  addLink(totalIncomeIdx, spacerIdx, totalIncome);

  const savings = totalIncome - totalExpense;
  if (savings > 0) {
    const savingsIdx = nodeFor(SAVINGS, INCOME_COLOR);
    middleTierNames.add(SAVINGS);
    addLink(spacerIdx, savingsIdx, savings);
  }

  for (const [group, groupAmount] of sortedByValueDesc(groupTotals)) {
    const color = colorForGroup(group);
    const groupNodeIdx = nodeFor(group, color);
    middleTierNames.add(group);
    expandableGroupNames.add(group);
    addLink(spacerIdx, groupNodeIdx, groupAmount);

    if (group !== expandedGroup) continue;
    const itemTotals = itemTotalsByGroup.get(group) ?? new Map();
    for (const [item, itemAmount] of sortedByValueDesc(itemTotals)) {
      addLink(groupNodeIdx, nodeFor(`${group} · ${item}`, color), itemAmount);
    }
  }

  // Percentages are relative to total income for every node (expense groups/items included),
  // not each node's own column total — so every expense group's % plus Savings' % add up to
  // 100%, matching how the money actually splits out of income instead of two disconnected
  // 100%s (one over total expense, one over total income).
  const links = [...linkAmounts.entries()].map(([key, value]) => {
    const [source, target] = key.split("->").map(Number);
    return { source, target, value: value / divisor };
  });

  return { nodes, links, colorByName, middleTierNames, expandableGroupNames, totalIncome: totalIncome / divisor, totalExpense: totalExpense / divisor };
}

function SankeyChart({
  transactions,
  height,
  divisor,
}: {
  transactions: TransactionRecord[];
  height: number;
  divisor: number;
}) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const { nodes, links, colorByName, middleTierNames, expandableGroupNames, totalIncome } = useMemo(
    () => buildSankeyData(transactions, expandedGroup, divisor),
    [transactions, expandedGroup, divisor]
  );

  // Per-node vertical nudge from dragging, keyed by name (stable across data refreshes) rather
  // than index — layout itself is still recharts' auto-computed one; a drag only offsets that
  // node's own bar/label and re-anchors whichever links touch it, it doesn't reflow siblings.
  const [dragOffsets, setDragOffsets] = useState<Record<string, number>>({});
  const dragRef = useRef<{ name: string; startClientX: number; startClientY: number; startOffset: number; min: number; max: number; moved: boolean } | null>(
    null
  );

  if (nodes.length === 0 || links.length === 0) {
    return <p className="text-xs text-nw-muted">Not enough income and expense data yet to chart.</p>;
  }

  function beginDrag(name: string, startOffset: number, min: number, max: number, e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { name, startClientX: e.clientX, startClientY: e.clientY, startOffset, min, max, moved: false };
    document.body.style.cursor = "grabbing";

    function onMove(moveEvent: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      if (Math.abs(moveEvent.clientX - drag.startClientX) > 3 || Math.abs(moveEvent.clientY - drag.startClientY) > 3) {
        drag.moved = true;
      }
      const next = Math.min(drag.max, Math.max(drag.min, drag.startOffset + (moveEvent.clientY - drag.startClientY)));
      setDragOffsets((prev) => ({ ...prev, [drag.name]: next }));
    }
    function onUp() {
      const drag = dragRef.current;
      dragRef.current = null;
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // A mouseup with no meaningful movement is a click, not a drag — toggle that group's
      // item-level drilldown instead of (or in addition to) nudging its position.
      if (drag && !drag.moved && expandableGroupNames.has(drag.name)) {
        setExpandedGroup((current) => (current === drag.name ? null : drag.name));
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function renderNode(props: { x: number; y: number; width: number; height: number; payload: SankeyNodePayload }) {
    const { x, y, width, height: h, payload } = props;
    if (payload.name === SPACER) return <g />;
    const offset = dragOffsets[payload.name] ?? 0;
    const nodeY = y + offset;
    const color = colorByName.get(payload.name) ?? "var(--nw-green-line)";
    const labelOnRight = !middleTierNames.has(payload.name);
    const textX = labelOnRight ? x + width + 8 : x - 8;
    const textAnchor = labelOnRight ? "start" : "end";
    const pct = totalIncome > 0 ? (payload.value / totalIncome) * 100 : 0;
    const isExpandable = expandableGroupNames.has(payload.name);
    const isExpanded = payload.name === expandedGroup;
    const label = isExpandable ? `${isExpanded ? "▾" : "▸"} ${payload.name}` : payload.name;
    // Nodes can only slide within the plot's own vertical bounds (not off the top/bottom edge) —
    // node y already has the 10px top margin baked in, per recharts' own layout.
    const min = SANKEY_MARGIN - y;
    const max = height - SANKEY_MARGIN - y - h;
    return (
      <g
        onMouseDown={(e) => beginDrag(payload.name, offset, min, max, e)}
        style={{ cursor: isExpandable ? "pointer" : "grab" }}
      >
        <rect x={x - 3} y={nodeY} width={width + 6} height={h} fill="transparent" />
        <rect x={x} y={nodeY} width={width} height={h} fill={color} rx={1.5} />
        <text x={textX} y={nodeY + h / 2 - 6} textAnchor={textAnchor} fontSize={11} fill="var(--nw-muted)">
          {label}
        </text>
        <text x={textX} y={nodeY + h / 2 + 9} textAnchor={textAnchor} fontSize={12} fontWeight={700} fill="var(--nw-text)">
          {money(payload.value)} ({pct.toFixed(1)}%)
        </text>
      </g>
    );
  }

  function renderLink(props: {
    sourceX: number;
    sourceY: number;
    sourceControlX: number;
    targetControlX: number;
    targetX: number;
    targetY: number;
    linkWidth: number;
    index: number;
    payload: SankeyLinkPayload;
  }) {
    const { sourceX, sourceControlX, targetControlX, targetX, linkWidth, payload } = props;
    const sourceY = props.sourceY + (dragOffsets[payload.source.name] ?? 0);
    const targetY = props.targetY + (dragOffsets[payload.target.name] ?? 0);
    // Solid fill in the DESTINATION's color, not a source→target gradient blend — a link
    // flowing into e.g. Food read as a washed-out green/amber blend before (bleeding the
    // upstream "Total income" green into it), instead of reading as Food's own amber.
    const targetColor = colorByName.get(payload.target.name) ?? "var(--nw-green-line)";
    return (
      <path
        d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
        fill="none"
        stroke={targetColor}
        strokeOpacity={0.4}
        strokeWidth={linkWidth}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <ResponsiveContainer width="100%" height={height}>
        <Sankey
          data={{ nodes, links }}
          node={renderNode as unknown as object}
          link={renderLink as unknown as object}
          nodePadding={28}
          nodeWidth={10}
          // Default "justify" alignment force-pushes every sink (node with no outgoing links)
          // to the chart's rightmost column — harmless while every group is a sink at the same
          // depth, but once one group expands into items, its now-deeper items are ALSO sinks
          // and land in that same rightmost column as the other (still-collapsed, shallower)
          // groups, reading as one merged column instead of items sitting one column further
          // right. "left" alignment keeps every node at its own true graph depth instead.
          align="left"
          margin={{ top: SANKEY_MARGIN, right: 170, bottom: SANKEY_MARGIN, left: 170 }}
        >
          <Tooltip
            contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 11 }}
            itemStyle={{ color: "var(--nw-text)" }}
            labelStyle={{ color: "var(--nw-text)" }}
            formatter={(value) => money(Number(value))}
          />
        </Sankey>
      </ResponsiveContainer>
      <p className="text-[10px] text-nw-muted">Click a spending group (▸) to see its items; click again to collapse.</p>
    </div>
  );
}

export function CashFlowSankey({
  transactions,
  start,
  end,
  height = 380,
}: {
  transactions: TransactionRecord[];
  start: string;
  end: string;
  height?: number;
}) {
  const [showLarge, setShowLarge] = useState(false);
  const [mode, setMode] = useState<"total" | "avgMonthly">("total");
  const divisor = mode === "avgMonthly" ? monthsBetween(start, end) : 1;

  // Same signed-income / abs-expense formula as the Cash Flow tile's "Savings Rate" (just at
  // 1 decimal instead of 0) — computed here directly so a rate still shows even when
  // expenses >= income, since the diagram itself can't draw a negative-width Savings link.
  const savingsRate = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of transactions) {
      if (t.type === "income") income += Number(t.amount);
      else expense += Math.abs(Number(t.amount));
    }
    return income > 0 ? ((income - expense) / income) * 100 : null;
  }, [transactions]);

  const modeToggle = (
    <div className="flex border border-nw-border rounded-md overflow-hidden text-xs flex-none">
      <button
        onClick={() => setMode("total")}
        className={"px-2 py-1 whitespace-nowrap " + (mode === "total" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
      >
        Total
      </button>
      <button
        onClick={() => setMode("avgMonthly")}
        className={"px-2 py-1 whitespace-nowrap " + (mode === "avgMonthly" ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted")}
      >
        Average Monthly
      </button>
    </div>
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-baseline gap-2">
          <div className="text-sm font-medium">Where the Money Flows</div>
          {savingsRate !== null && (
            <span className="text-xs text-nw-muted">Savings rate: {savingsRate.toFixed(1)}%</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {modeToggle}
          <button
            onClick={() => setShowLarge(true)}
            className="text-xs text-nw-mint border border-nw-border rounded-md px-2 py-1 hover:border-nw-line-hi flex-none"
          >
            ⤢ Expand
          </button>
        </div>
      </div>
      <SankeyChart transactions={transactions} height={height} divisor={divisor} />
      {showLarge && (
        <Modal onClose={() => setShowLarge(false)} className="w-full max-w-5xl rounded-lg border border-nw-border bg-nw-rail p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-baseline gap-2">
              <div className="text-sm font-medium">Where the Money Flows</div>
              {savingsRate !== null && (
                <span className="text-xs text-nw-muted">Savings rate: {savingsRate.toFixed(1)}%</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {modeToggle}
              <button onClick={() => setShowLarge(false)} className="text-nw-muted text-xs">
                ✕
              </button>
            </div>
          </div>
          <SankeyChart transactions={transactions} height={640} divisor={divisor} />
        </Modal>
      )}
    </>
  );
}
