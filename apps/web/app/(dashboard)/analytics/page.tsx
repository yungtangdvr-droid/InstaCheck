import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PeriodFilter } from '@/components/analytics/PeriodFilter'
import { DataHealthPanel } from '@/components/analytics/DataHealthPanel'
import { ReachChart } from '@/components/charts/ReachChart'
import { SavesChart } from '@/components/charts/SavesChart'
import { PostExplorer } from '@/components/charts/PostExplorer'
import { getReachSeries, getTopPosts } from '@/features/analytics/get-analytics-data'
import { getDataHealth } from '@/features/analytics/get-data-health'
import { parsePeriod } from '@/features/analytics/utils'
import Link from 'next/link'

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period = parsePeriod(periodParam)

  const supabase = await createServerSupabaseClient()

  const [health, reachResult, topPostsResult] = await Promise.all([
    getDataHealth(supabase, period),
    getReachSeries(supabase, period),
    getTopPosts(supabase, period),
  ])

  const reachData = reachResult.data  ?? []
  const topPosts  = topPostsResult.data ?? []

  const totalReach = reachData.reduce((s, d) => s + d.reach, 0)
  const totalSaves = reachData.reduce((s, d) => s + d.saves, 0)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Analytics</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Performances de ton compte Instagram
          </p>
        </div>
        <PeriodFilter current={period} />
      </div>

      {/* Production Data Health / Sync Status */}
      <DataHealthPanel health={health} period={period} />

      {/* Period stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label={`Posts (${period}j)`}
          value={health.periodPosts}
          hint={
            health.totalPosts > 0
              ? `${health.totalPosts.toLocaleString('fr-FR')} indexés au total`
              : undefined
          }
        />
        <StatCard
          label={`Reach (${period}j)`}
          value={totalReach > 0 ? totalReach.toLocaleString('fr-FR') : '—'}
        />
        <StatCard
          label={`Saves (${period}j)`}
          value={totalSaves > 0 ? totalSaves.toLocaleString('fr-FR') : '—'}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-sm font-medium text-neutral-300">Reach</h2>
          <ReachChart data={reachData} />
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-sm font-medium text-neutral-300">Saves · Shares</h2>
          <SavesChart data={reachData} />
        </div>
      </div>

      {/* Post explorer */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-300">
            Posts — {period}j
          </h2>
          <Link
            href={`/analytics/formats?period=${period}`}
            className="text-xs text-neutral-500 transition-colors hover:text-neutral-300"
          >
            Vue par format →
          </Link>
        </div>
        <PostExplorer posts={topPosts} />
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
      {hint && (
        <p className="mt-1 text-[11px] text-neutral-500">{hint}</p>
      )}
    </div>
  )
}
