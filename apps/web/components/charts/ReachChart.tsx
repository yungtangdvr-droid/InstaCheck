'use client'

import { MetricChart } from './MetricChart'
import type { TChartDataPoint } from '@creator-hub/types'

interface ReachChartProps {
  data: TChartDataPoint[]
  total: number
  deltaPct: number
}

export function ReachChart({ data, total, deltaPct }: ReachChartProps) {
  return (
    <MetricChart
      data={data}
      metric="reach"
      color="#6366f1"
      label="Reach"
      total={total}
      deltaPct={deltaPct}
    />
  )
}
