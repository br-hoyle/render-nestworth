"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NetWorthPoint } from "@/lib/types";
import { money } from "@/lib/format";

export function NetWorthChart({ points, height = 220 }: { points: NetWorthPoint[]; height?: number }) {
  const data = points.map((p) => ({
    date: p.full_date,
    netWorth: Number(p.net_worth),
    assets: Number(p.assets),
    liabilities: -Number(p.liabilities),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
          contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }}
          formatter={(value) => money(Number(value))}
        />
        <Line type="monotone" dataKey="netWorth" stroke="var(--nw-green)" strokeWidth={2} dot={false} name="Net worth" />
        <Line type="monotone" dataKey="assets" stroke="var(--nw-muted)" strokeWidth={1.5} dot={false} name="Assets" />
        <Line type="monotone" dataKey="liabilities" stroke="var(--nw-coral)" strokeWidth={1.5} dot={false} name="Liabilities" />
      </LineChart>
    </ResponsiveContainer>
  );
}
