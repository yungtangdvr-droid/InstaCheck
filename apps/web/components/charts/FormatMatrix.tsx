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
import { FORMAT_LABEL, fmtK } from '@/features/analytics/utils'
import type { TFormatSummary } from '@creator-hub/types'

type Props = { data: TFormatSummary[] }

// Reach and saves/shares differ by 1–3 orders of magnitude. Plotted on the
// same linear Y-axis, the saves/shares bars collapse into the baseline. Keep
// them in two dedicated charts so both stay legible; share the x-axis
// semantics (format label) by ordering `data` identically.
export function FormatMatrix({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Pas encore de données par format
      </div>
    )
  }

  const chartData = data.map(d => ({
    name:   FORMAT_LABEL[d.mediaType] ?? d.mediaType,
    Reach:  d.reach,
    Saves:  d.saves,
    Shares: d.shares,
  }))

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">Reach</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: '#737373', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={fmtK}
              tick={{ fill: '#737373', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#a3a3a3' }}
              cursor={{ fill: '#1a1a1a' }}
              formatter={(value: unknown) => [fmtK(Number(value)), 'Reach']}
            />
            <Bar dataKey="Reach" fill="#818cf8" radius={[2, 2, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">Saves · Shares</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: '#737373', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={fmtK}
              tick={{ fill: '#737373', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#a3a3a3' }}
              cursor={{ fill: '#1a1a1a' }}
              formatter={(value: unknown, name: unknown) => [fmtK(Number(value)), String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#a3a3a3' }} />
            <Bar dataKey="Saves"  fill="#f59e0b" radius={[2, 2, 0, 0]} maxBarSize={24} />
            <Bar dataKey="Shares" fill="#10b981" radius={[2, 2, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
