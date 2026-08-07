"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/format";

export interface StackedGrowthPoint {
  label: number | string;
  starting: number;
  contributions: number;
  growth: number;
}

/** Stacked area chart breaking a balance projection into its three components — starting
 * balance, contributions added since, and growth from returns — so the three sum visibly to
 * the total at every point, instead of a single opaque balance line. */
export function StackedGrowthChart({ data, xLabel }: { data: StackedGrowthPoint[]; xLabel: string }) {
  if (data.length < 2) return <p className="text-xs text-nw-muted">Not enough data yet.</p>;
  return (
    <div className="rounded-lg border border-nw-border bg-nw-surface p-3">
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data}>
          <CartesianGrid stroke="var(--nw-border)" vertical={false} />
          <XAxis dataKey="label" name={xLabel} tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={{ stroke: "var(--nw-border)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--nw-muted)" }} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => money(v)} />
          <Tooltip contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }} formatter={(v) => money(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="starting" name="Starting Balance" stackId="1" stroke="var(--nw-muted)" fill="var(--nw-muted)" fillOpacity={0.35} />
          <Area type="monotone" dataKey="contributions" name="Contributions" stackId="1" stroke="var(--nw-mint)" fill="var(--nw-mint)" fillOpacity={0.5} />
          <Area type="monotone" dataKey="growth" name="Growth" stackId="1" stroke="var(--nw-green)" fill="var(--nw-green)" fillOpacity={0.6} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
