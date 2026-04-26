import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ReachChart } from '@/components/charts/ReachChart'
import { FORMAT_LABEL, fmtK } from '@/features/analytics/utils'
import { getPostPerformance } from '@/features/analytics/get-analytics-data'
import {
  computeDistributionScore,
  distributionInterpretation,
  DISTRIBUTION_LABEL_CLASS,
  DISTRIBUTION_LABEL_FR,
  DISTRIBUTION_SIGNAL_FR,
  type TDistributionLabel,
  type TDistributionSignal,
} from '@/features/analytics/engagement-score'
import type { TDailyMetricPoint } from '@creator-hub/types'

// Impressions is deprecated for Instagram media posted after 2024-07-02 and
// is intentionally omitted from `MEDIA_INSIGHTS_METRICS` in the Meta client.
// Do not render it as a card — the stored value is always 0 and misleads.
export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const [{ data: post }, { data: metrics }, perfResult] = await Promise.all([
    supabase
      .from('posts')
      .select('id, media_id, media_type, caption, permalink, posted_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('post_metrics_daily')
      .select('date, reach, saves, shares, likes, comments, profile_visits')
      .eq('post_id', id)
      .order('date', { ascending: true }),
    getPostPerformance(supabase, id),
  ])

  if (!post) notFound()

  const totals = (metrics ?? []).reduce(
    (acc, m) => ({
      reach:         acc.reach         + (m.reach          ?? 0),
      saves:         acc.saves         + (m.saves           ?? 0),
      shares:        acc.shares        + (m.shares          ?? 0),
      likes:         acc.likes         + (m.likes           ?? 0),
      comments:      acc.comments      + (m.comments        ?? 0),
      profileVisits: acc.profileVisits + (m.profile_visits  ?? 0),
    }),
    { reach: 0, saves: 0, shares: 0, likes: 0, comments: 0, profileVisits: 0 },
  )

  const reachSeries: TDailyMetricPoint[] = (metrics ?? []).map(m => ({
    date:     m.date,
    reach:    m.reach    ?? 0,
    saves:    m.saves    ?? 0,
    shares:   m.shares   ?? 0,
    likes:    m.likes    ?? 0,
    comments: m.comments ?? 0,
  }))

  const perf = perfResult.data

  // v2 Score circulation — log-scaled rate ratios vs same-format baseline.
  // Baseline rate is approximated as baseline_count / current post reach
  // (caller-side fallback to median rate happens in the analytics list path,
  // but on a single post we only have the per-post mart row).
  const baselineRate = (count: number | null | undefined): number | null => {
    if (count == null || totals.reach <= 0) return null
    const n = Number(count)
    return Number.isFinite(n) && n > 0 ? n / totals.reach : null
  }

  const engagement = computeDistributionScore({
    reach:         totals.reach,
    saves:         totals.saves,
    shares:        totals.shares,
    comments:      totals.comments,
    likes:         totals.likes,
    profileVisits: totals.profileVisits > 0 ? totals.profileVisits : null,
    baselineRates: perf
      ? {
          shares:        baselineRate(perf.baselines.shares),
          saves:         baselineRate(perf.baselines.saves),
          comments:      baselineRate(perf.baselines.comments),
          likes:         baselineRate(perf.baselines.likes),
          profileVisits: baselineRate(perf.baselines.profileVisits),
        }
      : undefined,
  })

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
          {post.caption ?? <span className="italic text-neutral-500">Sans légende IG</span>}
        </h1>
        {post.posted_at && (
          <p className="mt-1 text-sm text-neutral-500">
            Publié le{' '}
            {new Date(post.posted_at).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
          </p>
        )}
      </div>

      {/* Metric cards — Impressions intentionally omitted (deprecated metric). */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Reach"        value={totals.reach} />
        <MetricCard label="Saves"        value={totals.saves}  highlight />
        <MetricCard label="Shares"       value={totals.shares} highlight />
        <MetricCard label="Likes"        value={totals.likes} />
        <MetricCard label="Commentaires" value={totals.comments} />
      </div>

      {/* vs format moyen */}
      {perf && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium text-neutral-300">
              Score circulation vs format moyen
            </h2>
            <span className="text-xs text-neutral-500">
              Baseline {FORMAT_LABEL[perf.mediaType] ?? perf.mediaType} · 30 j
              {perf.formatSampleSize > 0 && (
                <> · {perf.formatSampleSize} post{perf.formatSampleSize > 1 ? 's' : ''}</>
              )}
            </span>
          </div>

          <CirculationSummary
            score={engagement.score}
            label={engagement.label}
            dominantSignal={engagement.dominantSignal}
            interpretation={distributionInterpretation(engagement)}
            hasReach={engagement.hasReach}
          />

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <MultiplierTile
              label="Shares"
              actual={perf.totals.shares}
              baseline={perf.baselines.shares}
              multiplier={perf.multipliers.shares}
              accent={engagement.dominantSignal === 'shares'}
            />
            <MultiplierTile
              label="Saves"
              actual={perf.totals.saves}
              baseline={perf.baselines.saves}
              multiplier={perf.multipliers.saves}
              accent={engagement.dominantSignal === 'saves'}
            />
            <MultiplierTile
              label="Comments"
              actual={perf.totals.comments}
              baseline={perf.baselines.comments}
              multiplier={perf.multipliers.comments}
              accent={engagement.dominantSignal === 'comments'}
            />
            <MultiplierTile
              label="Likes"
              actual={perf.totals.likes}
              baseline={perf.baselines.likes}
              multiplier={perf.multipliers.likes}
              accent={engagement.dominantSignal === 'likes'}
            />
            <MultiplierTile
              label="Profil"
              actual={perf.totals.profileVisits ?? 0}
              baseline={perf.baselines.profileVisits}
              multiplier={perf.multipliers.profileVisits}
              accent={engagement.dominantSignal === 'profileVisits'}
              missing={perf.totals.profileVisits == null}
            />
          </div>

          {perf.formatSampleSize > 0 && perf.formatSampleSize < 5 && (
            <p className="mt-3 text-xs text-amber-500/80">
              Échantillon faible ({perf.formatSampleSize} post
              {perf.formatSampleSize > 1 ? 's' : ''} dans le format sur 30 j) — la
              baseline est peu stable.
            </p>
          )}

          <p className="mt-3 text-[11px] text-neutral-600">
            Score mart (référence technique) : {perf.performanceScore}/100
            {' · '}
            Δ {perf.scoreDelta >= 0 ? '+' : ''}{perf.scoreDelta} vs baseline {perf.baselineScore}.
          </p>
        </div>
      )}

      {/* Reach over time */}
      {reachSeries.length > 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-1 text-sm font-medium text-neutral-300">
            Reach dans le temps
          </h2>
          {reachSeries.length === 1 && (
            <p className="mb-3 text-xs text-neutral-500">
              Évolution disponible après plusieurs syncs. Donnée actuelle =
              snapshot lifetime.
            </p>
          )}
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

function CirculationSummary({
  score,
  label,
  dominantSignal,
  interpretation,
  hasReach,
}: {
  score:          number
  label:          TDistributionLabel
  dominantSignal: TDistributionSignal | null
  interpretation: string
  hasReach:       boolean
}) {
  const cls = DISTRIBUTION_LABEL_CLASS[label]
  const dominantFr = dominantSignal ? DISTRIBUTION_SIGNAL_FR[dominantSignal] : null
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <p className="text-[11px] uppercase tracking-wide text-neutral-500">Score circulation</p>
        <span className="text-2xl font-semibold tabular-nums text-white">
          {hasReach ? `${score}` : '—'}
        </span>
        <span className="text-xs text-neutral-500">/ 100</span>
        <span
          className={`inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-medium ${cls}`}
        >
          {DISTRIBUTION_LABEL_FR[label]}
        </span>
        {dominantFr && hasReach && (
          <span className="text-[11px] text-neutral-400">
            Signal le plus fort : <span className="text-neutral-200">{dominantFr}</span>
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-neutral-300">{interpretation}</p>
    </div>
  )
}

function MultiplierTile({
  label,
  actual,
  baseline,
  multiplier,
  accent,
  missing,
}: {
  label:      string
  actual:     number
  baseline:   number | null
  multiplier: number | null
  accent?:    boolean
  missing?:   boolean
}) {
  const color =
    missing                ? 'text-neutral-600' :
    multiplier == null     ? 'text-neutral-400' :
    multiplier >= 1.5      ? 'text-emerald-400' :
    multiplier >= 0.8      ? 'text-neutral-200' :
                             'text-red-400'
  const borderCls = accent
    ? 'border-emerald-500/40 bg-emerald-500/5'
    : 'border-neutral-800 bg-neutral-950/40'

  return (
    <div
      className={`rounded-md border p-3 ${borderCls}`}
      title={accent ? 'Signal dominant pour ce post' : undefined}
    >
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>
        {missing ? 'n/a' : multiplier == null ? '—' : `×${multiplier.toFixed(1)}`}
      </p>
      <p className="mt-0.5 text-[11px] text-neutral-600 tabular-nums">
        {missing ? 'métrique non exposée' : `${fmtK(actual)} vs ${baseline == null ? '—' : fmtK(Math.round(baseline))}`}
      </p>
    </div>
  )
}
