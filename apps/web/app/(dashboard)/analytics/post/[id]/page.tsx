import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ReachChart } from '@/components/charts/ReachChart'
import { FORMAT_LABEL } from '@/features/analytics/utils'
import type { TDailyMetricPoint } from '@creator-hub/types'

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const [{ data: post }, { data: metrics }] = await Promise.all([
    supabase
      .from('posts')
      .select('id, media_id, media_type, caption, permalink, posted_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('post_metrics_daily')
      .select('date, reach, saves, shares, likes, comments, impressions, profile_visits')
      .eq('post_id', id)
      .order('date', { ascending: true }),
  ])

  if (!post) notFound()

  const totals = (metrics ?? []).reduce(
    (acc, m) => ({
      reach:         acc.reach         + (m.reach          ?? 0),
      impressions:   acc.impressions   + (m.impressions     ?? 0),
      saves:         acc.saves         + (m.saves           ?? 0),
      shares:        acc.shares        + (m.shares          ?? 0),
      likes:         acc.likes         + (m.likes           ?? 0),
      comments:      acc.comments      + (m.comments        ?? 0),
      profileVisits: acc.profileVisits + (m.profile_visits  ?? 0),
    }),
    { reach: 0, impressions: 0, saves: 0, shares: 0, likes: 0, comments: 0, profileVisits: 0 },
  )

  const reachSeries: TDailyMetricPoint[] = (metrics ?? []).map(m => ({
    date:     m.date,
    reach:    m.reach    ?? 0,
    saves:    m.saves    ?? 0,
    shares:   m.shares   ?? 0,
    likes:    m.likes    ?? 0,
    comments: m.comments ?? 0,
  }))

  return (
    <div className="space-y-8">
      {/* Breadcrumb + meta */}
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs text-neutral-500">
          <Link href="/analytics" className="hover:text-neutral-300">
            Analytics
          </Link>
          <span>/</span>
          <span className="max-w-xs truncate">
            {post.caption?.slice(0, 50) ?? post.media_id}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
            {FORMAT_LABEL[post.media_type] ?? post.media_type}
          </span>
          {post.permalink && (
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              Voir sur Instagram →
            </a>
          )}
        </div>
        <h1 className="mt-2 line-clamp-3 text-xl font-semibold text-white">
          {post.caption ?? <span className="italic text-neutral-500">Sans caption</span>}
        </h1>
        {post.posted_at && (
          <p className="mt-1 text-sm text-neutral-500">
            Publié le{' '}
            {new Date(post.posted_at).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
          </p>
        )}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Reach"         value={totals.reach} />
        <MetricCard label="Impressions"   value={totals.impressions} />
        <MetricCard label="Saves"         value={totals.saves}   highlight />
        <MetricCard label="Shares"        value={totals.shares}  highlight />
        <MetricCard label="Likes"         value={totals.likes} />
        <MetricCard label="Commentaires"  value={totals.comments} />
      </div>

      {/* Reach over time */}
      {reachSeries.length > 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-sm font-medium text-neutral-300">
            Reach dans le temps
          </h2>
          <ReachChart data={reachSeries} />
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-500">
          Aucune métrique journalière disponible pour ce post.
        </div>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          highlight ? 'text-amber-400' : 'text-white'
        }`}
      >
        {value.toLocaleString('fr-FR')}
      </p>
    </div>
  )
}
