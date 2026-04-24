'use client'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { TDailyMetricPoint } from '@creator-hub/types'
import { fmtK } from '@/features/analytics/utils'

type Props = { data: TDailyMetricPoint[] }

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

export function SavesChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
        Pas encore de données de saves / shares
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
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
          formatter={(value: unknown, name: unknown) => [fmtK(Number(value)), String(name)]}
          cursor={{ fill: '#262626' }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#a3a3a3' }} />
        <Bar dataKey="saves"  name="Saves"  fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={16} />
        <Bar dataKey="shares" name="Shares" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  )
}
