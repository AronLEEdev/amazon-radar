'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface SparkPoint {
  t: number; // ms timestamp
  v: number | null;
}

export function Sparkline({
  data,
  color = '#3b82f6',
  fill = 'rgba(59,130,246,0.12)',
  invertY = false,
  height = 60,
}: {
  data: SparkPoint[];
  color?: string;
  fill?: string;
  invertY?: boolean;
  height?: number;
}) {
  const cleaned = data.filter((d) => d.v !== null) as Array<{ t: number; v: number }>;
  if (cleaned.length < 2) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-md border border-dashed border-zinc-200 text-[10px] text-zinc-400"
      >
        needs ≥ 2 points
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={cleaned} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id={`g-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="t" hide />
        <YAxis hide reversed={invertY} domain={['auto', 'auto']} />
        <Tooltip
          contentStyle={{
            background: 'white',
            border: '1px solid #e4e4e7',
            borderRadius: 6,
            fontSize: 11,
            padding: '4px 6px',
          }}
          labelFormatter={(t) => new Date(t).toLocaleString()}
          formatter={(v: number) => [v.toLocaleString(), 'value']}
        />
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.75}
          fill={`url(#g-${color})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
