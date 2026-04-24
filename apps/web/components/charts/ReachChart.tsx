'use client'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { TDailyMetricPoint } from '@creator-hub/types'
import { fmtK } from '@/features/analytics/utils'

type Props = { data: TDailyMetricPoint[] }

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

export function ReachChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
        Pas encore de données de reach
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-reach" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#818cf8" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          tick={{ fill: '#737373', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmtK}
          tick={{ fill: '#737373', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip
          contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#a3a3a3' }}
          labelFormatter={(label: unknown) => fmtDate(String(label))}
          formatter={(value: unknown) => [fmtK(Number(value)), 'Reach']}
        />
        <Area
          type="monotone"
          dataKey="reach"
          stroke="#818cf8"
          strokeWidth={2}
          fill="url(#grad-reach)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
