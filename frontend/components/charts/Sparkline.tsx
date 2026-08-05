"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="w-16 h-6" />;
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="w-16 h-6">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
