'use client'

import { useMemo } from 'react'
import { ReachChart } from '@/components/charts/ReachChart'
import { SavesChart } from '@/components/charts/SavesChart'
import { SharesChart } from '@/components/charts/SharesChart'
import { PeriodFilter } from '@/components/ui/PeriodFilter'
import { PostExplorer } from '@/features/analytics/PostExplorer'
import { usePeriodFilter } from '@/hooks/use-period-filter'
import { getMockAnalyticsOverview } from '@/lib/mock/analytics'

export default function AnalyticsPage() {
  const { period, setPeriod } = usePeriodFilter()
  const data = useMemo(() => getMockAnalyticsOverview(period), [period])

  return (
    <div className="px-8 py-7 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Analytics</h1>
          <p className="mt-0.5 text-sm text-zinc-400">
            Performances de ton compte Instagram
          </p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-3 gap-4">
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
