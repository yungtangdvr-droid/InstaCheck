import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PeriodFilter } from '@/components/analytics/PeriodFilter'
import { FormatMatrix } from '@/components/charts/FormatMatrix'
import { BestWindowHeatmap } from '@/components/charts/BestWindowHeatmap'
import { getFormatBreakdown, getPostingWindows } from '@/features/analytics/get-analytics-data'
import type { TAnalyticsPeriod } from '@creator-hub/types'
import Link from 'next/link'

const VALID_PERIODS = [7, 30, 90] as const

function parsePeriod(raw: string | undefined): TAnalyticsPeriod {
  const n = parseInt(raw ?? '', 10)
  return (VALID_PERIODS as readonly number[]).includes(n) ? (n as TAnalyticsPeriod) : 30
}

export default async function FormatsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period = parsePeriod(periodParam)

  const supabase = await createServerSupabaseClient()

  const [formatResult, windowResult] = await Promise.all([
    getFormatBreakdown(supabase, period),
    getPostingWindows(supabase, period),
  ])

  const formatData = formatResult.data ?? []
  const windowData = windowResult.data ?? []

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs text-neutral-500">
            <Link href="/analytics" className="hover:text-neutral-300">
              Analytics
            </Link>
            <span>/</span>
            <span>Formats</span>
          </div>
          <h1 className="text-2xl font-semibold text-white">
            Performances par format
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Reach · Saves · Shares agrégés par type de contenu
          </p>
        </div>
        <PeriodFilter current={period} />
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-4 text-sm font-medium text-neutral-300">
          Reach · Saves · Shares par format
        </h2>
        <FormatMatrix data={formatData} />
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-4 text-sm font-medium text-neutral-300">
          Meilleurs créneaux de publication
        </h2>
        <BestWindowHeatmap data={windowData} />
      </div>
    </div>
  )
}
