"use client";

import { useMemo } from "react";
import { Sankey, Tooltip } from "recharts";
import type { TransactionRecord } from "@/lib/types";
import { money } from "@/lib/format";

const NODE_COLOR = "var(--nw-green-line)";

function SankeyNode(props: {
  x: number;
  y: number;
  width: number;
  height: number;
  payload: { name: string };
  containerWidth: number;
}) {
  const { x, y, width, height, payload, containerWidth } = props;
  const isOnRight = x + width > containerWidth / 2;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={NODE_COLOR} stroke="var(--nw-border)" />
      <text
        x={isOnRight ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isOnRight ? "end" : "start"}
        dominantBaseline="middle"
        fontSize={11}
        fill="var(--nw-text)"
      >
        {payload.name}
      </text>
    </g>
  );
}

export function CashFlowSankey({ transactions, height = 320 }: { transactions: TransactionRecord[]; height?: number }) {
  const { nodes, links } = useMemo(() => buildSankeyData(transactions), [transactions]);

  if (nodes.length === 0 || links.length === 0) {
    return <p className="text-xs text-nw-muted">Not enough income and expense data yet to chart.</p>;
  }

  return (
    <Sankey
      width={640}
      height={height}
      data={{ nodes, links }}
      node={SankeyNode as unknown as object}
      link={{ stroke: "var(--nw-green-line)", strokeOpacity: 0.3 }}
      nodePadding={20}
      margin={{ top: 10, right: 140, bottom: 10, left: 140 }}
    >
      <Tooltip
        contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 11 }}
        itemStyle={{ color: "var(--nw-text)" }}
        labelStyle={{ color: "var(--nw-text)" }}
        formatter={(value) => money(Number(value))}
      />
    </Sankey>
  );
}

function buildSankeyData(transactions: TransactionRecord[]) {
  const nodeIndex = new Map<string, number>();
  const nodes: { name: string }[] = [];
  const linkAmounts = new Map<string, number>();

  function nodeFor(name: string): number {
    if (!nodeIndex.has(name)) {
      nodeIndex.set(name, nodes.length);
      nodes.push({ name });
    }
    return nodeIndex.get(name)!;
  }

  function addLink(sourceName: string, targetName: string, amount: number) {
    if (amount <= 0) return;
    const source = nodeFor(sourceName);
    const target = nodeFor(targetName);
    const key = `${source}->${target}`;
    linkAmounts.set(key, (linkAmounts.get(key) ?? 0) + amount);
  }

  const TOTAL_INCOME = "Total income";

  for (const t of transactions) {
    const amount = Math.abs(Number(t.amount));
    if (t.type === "income") {
      const bucket = t.item || t.group || t.merchant || "Other income";
      addLink(bucket, TOTAL_INCOME, amount);
    } else {
      const group = t.group || "Other";
      const item = t.item || "Other";
      addLink(TOTAL_INCOME, group, amount);
      addLink(group, `${group} · ${item}`, amount);
    }
  }

  const links = [...linkAmounts.entries()].map(([key, value]) => {
    const [source, target] = key.split("->").map(Number);
    return { source, target, value };
  });

  return { nodes, links };
}
