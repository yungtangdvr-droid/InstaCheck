'use client'

import { useMemo } from 'react'
import { ReachChart } from '@/components/charts/ReachChart'
import { SavesChart } from '@/components/charts/SavesChart'
import { SharesChart } from '@/components/charts/SharesChart'
import { PeriodFilter } from '@/components/ui/PeriodFilter'
import { PostExplorer } from '@/features/analytics/PostExplorer'
import { usePeriodFilter } from '@/hooks/use-period-filter'
// TODO(sprint-2-data): replace getMockAnalyticsOverview with a real fetch once
// post_metrics_daily is aggregated (e.g. a /api/analytics?period= route or a
// server action that queries the Supabase views).
import { getMockAnalyticsOverview } from '@/lib/mock/analytics'

export function AnalyticsCharts() {
  const { period, setPeriod } = usePeriodFilter()
  const data = useMemo(() => getMockAnalyticsOverview(period), [period])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Performances</h2>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ReachChart
          data={data.chart_data}
          total={data.totals.reach}
          deltaPct={data.totals.reach_delta_pct}
        />
        <SavesChart
          data={data.chart_data}
          total={data.totals.saves}
          deltaPct={data.totals.saves_delta_pct}
        />
        <SharesChart
          data={data.chart_data}
          total={data.totals.shares}
          deltaPct={data.totals.shares_delta_pct}
        />
      </div>

      <PostExplorer posts={data.posts} />
    </div>
  )
}
