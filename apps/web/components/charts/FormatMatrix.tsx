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
import type { TFormatSummary } from '@creator-hub/types'

type Props = { data: TFormatSummary[] }

const FORMAT_LABEL: Record<string, string> = {
  IMAGE:          'Image',
  VIDEO:          'Vidéo',
  CAROUSEL_ALBUM: 'Carousel',
  REEL:           'Reel',
  STORY:          'Story',
}

export function FormatMatrix({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
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
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: '#737373', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#737373', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip
          contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#a3a3a3' }}
          cursor={{ fill: '#1a1a1a' }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#a3a3a3' }} />
        <Bar dataKey="Reach"  fill="#818cf8" radius={[2, 2, 0, 0]} maxBarSize={24} />
        <Bar dataKey="Saves"  fill="#f59e0b" radius={[2, 2, 0, 0]} maxBarSize={24} />
        <Bar dataKey="Shares" fill="#10b981" radius={[2, 2, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  )
}
