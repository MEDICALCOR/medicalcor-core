'use client';

import {
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from 'recharts';
import type { NPSTrendData, LoyaltyDistribution } from '@medicalcor/types';

interface NPSChartProps {
  data: NPSTrendData[];
}

export function NPSTrendChart({ data }: NPSChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorNPS" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="period" className="text-xs" />
        <YAxis className="text-xs" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
        />
        <Legend />
        <Area
          type="monotone"
          dataKey="npsScore"
          stroke="#22c55e"
          fillOpacity={1}
          fill="url(#colorNPS)"
          name="NPS Score"
        />
        <Line
          type="monotone"
          dataKey="promoters"
          stroke="#9333ea"
          strokeWidth={2}
          name="Promotori"
        />
        <Line
          type="monotone"
          dataKey="detractors"
          stroke="#ef4444"
          strokeWidth={2}
          name="Detractori"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface LoyaltyPieChartProps {
  data: LoyaltyDistribution[];
}

const LOYALTY_COLORS: Record<string, string> = {
  Platinum: '#9333ea',
  Gold: '#eab308',
  Silver: '#6b7280',
  Bronze: '#b45309',
};

export function LoyaltyPieChart({ data }: LoyaltyPieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, value }) => `${name}: ${value}`}
          outerRadius={100}
          fill="#8884d8"
          dataKey="count"
          nameKey="segment"
        >
          {data.map((entry) => (
            <Cell key={`cell-${entry.segment}`} fill={LOYALTY_COLORS[entry.segment] ?? '#888'} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, name: string) => [value, name]}
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

interface RetentionBarChartProps {
  data: { name: string; value: number; color: string }[];
}

export function RetentionBarChart({ data }: RetentionBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="number" className="text-xs" />
        <YAxis type="category" dataKey="name" width={100} className="text-xs" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
        />
        <Bar dataKey="value" name="Pacienți">
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
