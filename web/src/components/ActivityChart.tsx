'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface DataPoint { label: string; value: number; }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div style={{
        background: 'rgba(10, 13, 28, 0.95)',
        border: '1px solid rgba(168, 85, 247, 0.4)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px rgba(139, 92, 246, 0.25)',
        padding: '8px 14px',
        fontFamily: 'var(--font-body)',
        fontSize: '0.72rem',
        backdropFilter: 'blur(20px)',
        borderRadius: 10
      }}>
        <div style={{ color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
        <div style={{ color: '#c084fc', fontWeight: 600 }}>{payload[0].value} applications</div>
      </div>
    );
  }
  return null;
};

export default function ActivityChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={150}>
      <AreaChart data={data} margin={{ top: 8, right: 0, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="cosmicGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
        <XAxis
          dataKey="label"
          tick={{ fontFamily: 'var(--font-body)', fontSize: 10, fill: 'rgba(255, 255, 255, 0.4)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontFamily: 'var(--font-body)', fontSize: 10, fill: 'rgba(255, 255, 255, 0.4)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#a855f7"
          strokeWidth={2}
          fill="url(#cosmicGrad)"
          dot={false}
          activeDot={{ r: 4, fill: '#c084fc', stroke: 'rgba(168, 85, 247, 0.5)', strokeWidth: 8 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
