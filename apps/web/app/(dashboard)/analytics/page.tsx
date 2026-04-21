import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PeriodFilter } from '@/components/analytics/PeriodFilter'
import { ReachChart } from '@/components/charts/ReachChart'
import { SavesChart } from '@/components/charts/SavesChart'
import { PostExplorer } from '@/components/charts/PostExplorer'
import { getReachSeries, getTopPosts } from '@/features/analytics/get-analytics-data'
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

  const [
    { data: recentRun },
    { count: postsCount },
    reachResult,
    topPostsResult,
  ] = await Promise.all([
    supabase
      .from('automation_runs')
      .select('ran_at, status')
      .eq('automation_name', 'daily-instagram-sync')
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('posts')
      .select('id', { count: 'exact', head: true }),
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Posts indexés" value={postsCount ?? 0} />
        <StatCard
          label={`Reach (${period}j)`}
          value={totalReach > 0 ? totalReach.toLocaleString('fr-FR') : '—'}
        />
        <StatCard
          label={`Saves (${period}j)`}
          value={totalSaves > 0 ? totalSaves.toLocaleString('fr-FR') : '—'}
        />
        <StatCard
          label="Dernier sync"
          value={
            recentRun
              ? new Date(recentRun.ran_at).toLocaleString('fr-FR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })
              : '—'
          }
          badge={recentRun?.status ?? undefined}
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
  badge,
}: {
  label: string
  value: string | number
  badge?: string
}) {
  const badgeColor =
    badge === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
    badge === 'failed'  ? 'bg-red-500/20 text-red-400'         : ''

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
      {badge && (
        <span className={`mt-2 inline-block rounded px-2 py-0.5 text-xs font-medium ${badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
  )
}
