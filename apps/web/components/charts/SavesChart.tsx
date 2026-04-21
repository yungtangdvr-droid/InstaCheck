'use client'

import { MetricChart } from './MetricChart'
import type { TChartDataPoint } from '@creator-hub/types'

interface SavesChartProps {
  data: TChartDataPoint[]
  total: number
  deltaPct: number
}

export function SavesChart({ data, total, deltaPct }: SavesChartProps) {
  return (
    <MetricChart
      data={data}
      metric="saves"
      color="#10b981"
      label="Saves"
      total={total}
      deltaPct={deltaPct}
    />
  )
}
