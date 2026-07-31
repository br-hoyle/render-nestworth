"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money } from "@/lib/format";

// Cycled across however many categories/types a household has — repeats past 6, which is
// an accepted tradeoff for a household-scale app (matches AllocationDonut's same approach).
const PALETTE = [
  "var(--nw-mint)",
  "var(--nw-green)",
  "var(--nw-green-deep)",
  "var(--nw-green-line)",
  "var(--nw-amber)",
  "var(--nw-muted)",
];

export function CategoryBreakdownChart({
  data,
  groups,
  height = 180,
}: {
  data: Record<string, number | string>[];
  groups: string[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--nw-border)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "var(--nw-muted)" }}
          tickLine={false}
          axisLine={{ stroke: "var(--nw-border)" }}
          minTickGap={40}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--nw-muted)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => money(v, { maximumFractionDigits: 0 })}
          width={70}
        />
        <Tooltip
          contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 11 }}
          formatter={(value) => money(Number(value))}
        />
        {groups.map((g, i) => (
          <Area
            key={g}
            type="monotone"
            dataKey={g}
            stackId="1"
            stroke={PALETTE[i % PALETTE.length]}
            fill={PALETTE[i % PALETTE.length]}
            fillOpacity={0.55}
            name={g}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
