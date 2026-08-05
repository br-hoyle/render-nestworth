"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

export function Sparkline({ values, color, className = "w-16 h-6" }: { values: number[]; color: string; className?: string }) {
  if (values.length < 2) {
    // Too small for a "Not enough history yet" label to fit — a bare empty div here read as
    // a rendering bug, so at least a muted dash (with the same message on hover) signals
    // "no chart yet" is the intended state, not broken.
    return (
      <div className={className + " flex items-center justify-center"} title="Not enough history yet">
        <span className="text-nw-muted text-xs leading-none">–</span>
      </div>
    );
  }
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
