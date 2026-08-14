"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NetWorthPoint } from "@/lib/types";
import { money, formatMonthYear } from "@/lib/format";

export function NetWorthChart({ points, height = 275 }: { points: NetWorthPoint[]; height?: number }) {
  const data = points.map((p) => ({
    date: p.full_date,
    netWorth: Number(p.net_worth),
  }));

  // Fraction of the gradient (top=max, bottom=min) that's above zero, so the fill/stroke
  // switch from green to coral exactly at the zero line regardless of the data's range.
  const gradientOffset = useMemo(() => {
    const values = data.map((d) => d.netWorth);
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (max <= 0) return 0;
    if (min >= 0) return 1;
    return max / (max - min);
  }, [data]);

  // Guarded here (not just by callers) so any future caller gets this for free — an
  // AreaChart with 0-1 points renders axes with no visible line and no explanation.
  if (data.length < 2) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <p className="text-xs text-nw-muted">Not enough history yet.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="netWorthSplit" x1="0" y1="0" x2="0" y2="1">
            <stop offset={gradientOffset} stopColor="var(--nw-green)" stopOpacity={1} />
            <stop offset={gradientOffset} stopColor="var(--nw-coral)" stopOpacity={1} />
          </linearGradient>
          <linearGradient id="netWorthSplitFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset={gradientOffset} stopColor="var(--nw-green)" stopOpacity={0.55} />
            <stop offset={gradientOffset} stopColor="var(--nw-coral)" stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--nw-border)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "var(--nw-muted)" }}
          tickLine={false}
          axisLine={{ stroke: "var(--nw-border)" }}
          minTickGap={40}
          tickFormatter={formatMonthYear}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--nw-muted)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => money(v, { maximumFractionDigits: 0 })}
          width={70}
        />
        <Tooltip
          contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }}
          formatter={(value) => money(Number(value))}
        />
        <ReferenceLine y={0} stroke="var(--nw-border)" />
        <Area
          type="monotone"
          dataKey="netWorth"
          stroke="url(#netWorthSplit)"
          fill="url(#netWorthSplitFill)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          name="Net worth"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
