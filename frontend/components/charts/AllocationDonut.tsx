"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["var(--nw-mint)", "var(--nw-green)", "var(--nw-green-deep)", "var(--nw-green-line)", "var(--nw-muted)"];

export function AllocationDonut({ mix, height = 140 }: { mix: Record<string, number>; height?: number }) {
  const data = Object.entries(mix).map(([name, value]) => ({ name, value }));
  if (data.length === 0) {
    return <div className="text-xs text-nw-muted flex items-center justify-center h-full">No asset data yet</div>;
  }

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={height} height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={height / 4} outerRadius={height / 2 - 4}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "var(--nw-surface)", border: "1px solid var(--nw-border)", fontSize: 12 }}
            formatter={(value) => `${Number(value).toFixed(1)}%`}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="flex-1">{d.name}</span>
            <span className="text-nw-muted">{d.value.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
