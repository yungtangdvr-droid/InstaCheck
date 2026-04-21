import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AnalyticsCharts } from '@/features/analytics/AnalyticsCharts'

export default async function AnalyticsPage() {
  const supabase = await createServerSupabaseClient()

  const { data: recentRun } = await supabase
    .from('automation_runs')
    .select('ran_at, status, result_summary')
    .eq('automation_name', 'daily-instagram-sync')
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { count: postsCount } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Analytics</h1>
        <p className="mt-1 text-sm text-neutral-400">Performances de ton compte Instagram</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Posts indexés" value={postsCount ?? 0} />
        <StatCard
          label="Dernier sync"
          value={
            recentRun
              ? new Date(recentRun.ran_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
              : '—'
          }
          badge={recentRun?.status}
        />
        <StatCard label="Sprint" value="2 — Analytics" />
      </div>

      <AnalyticsCharts />
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
    badge === 'failed'  ? 'bg-red-500/20 text-red-400' : ''

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
