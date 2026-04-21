'use client'

import { MetricChart } from './MetricChart'
import type { TChartDataPoint } from '@creator-hub/types'

interface SharesChartProps {
  data: TChartDataPoint[]
  total: number
  deltaPct: number
}

export function SharesChart({ data, total, deltaPct }: SharesChartProps) {
  return (
    <MetricChart
      data={data}
      metric="shares"
      color="#f59e0b"
      label="Shares"
      total={total}
      deltaPct={deltaPct}
    />
  )
}
