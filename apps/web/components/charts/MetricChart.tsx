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
import { formatDate, formatNumber } from '@/lib/utils'
import type { TChartDataPoint } from '@creator-hub/types'

type TMetricKey = 'reach' | 'saves' | 'shares'

interface MetricChartProps {
  data: TChartDataPoint[]
  metric: TMetricKey
  color: string
  label: string
  total: number
  deltaPct: number
}

const GRADIENT_IDS: Record<TMetricKey, string> = {
  reach: 'gradientReach',
  saves: 'gradientSaves',
  shares: 'gradientShares',
}

function DeltaBadge({ pct }: { pct: number }) {
  const positive = pct >= 0
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${
        positive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
      }`}
    >
      {positive ? '+' : ''}{pct}%
    </span>
  )
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-md text-xs">
      <p className="text-zinc-400 mb-0.5">{label ? formatDate(label) : ''}</p>
      <p className="font-semibold text-zinc-900">{formatNumber(payload[0].value)}</p>
    </div>
  )
}

export function MetricChart({ data, metric, color, label, total, deltaPct }: MetricChartProps) {
  const gradientId = GRADIENT_IDS[metric]

  const tickFormatter = (value: string, index: number) => {
    if (data.length <= 7) return formatDate(value)
    const step = Math.floor(data.length / 4)
    const validIndices = Array.from({ length: 4 }, (_, i) => i * step)
    return validIndices.includes(index) ? formatDate(value) : ''
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{formatNumber(total)}</p>
        </div>
        <DeltaBadge pct={deltaPct} />
      </div>

      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.15} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={tickFormatter}
            tick={{ fontSize: 10, fill: '#a1a1aa' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => formatNumber(v)}
            tick={{ fontSize: 10, fill: '#a1a1aa' }}
            axisLine={false}
            tickLine={false}
            width={45}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey={metric}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
