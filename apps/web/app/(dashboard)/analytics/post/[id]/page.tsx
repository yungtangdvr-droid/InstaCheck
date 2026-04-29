import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ReachChart } from '@/components/charts/ReachChart'
import { FORMAT_LABEL, fmtK } from '@/features/analytics/utils'
import { getPostPerformance } from '@/features/analytics/get-analytics-data'
import { extractPreviewUrls } from '@/features/analytics/media-preview'
import { PostMediaPreview } from '@/features/analytics/PostMediaPreview'
import { ContentAnalysisCard } from '@/features/content-lab/ContentAnalysisCard'
import { getPostContentAnalysis } from '@/features/content-lab/get-content-analysis'
import { PeerPercentileCard } from '@/features/benchmark/PeerPercentileCard'
import { getPeerPercentile } from '@/features/benchmark/get-peer-percentile'
import { PageHeader } from '@/components/ui/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { KpiTile } from '@/components/ui/kpi-tile'
import { VerdictBadge, type VerdictBadgeProps } from '@/components/ui/verdict-badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  computeDistributionScore,
  distributionInterpretation,
  DISTRIBUTION_LABEL_FR,
  DISTRIBUTION_SIGNAL_FR,
  type TDistributionLabel,
  type TDistributionSignal,
} from '@/features/analytics/engagement-score'
import type { TDailyMetricPoint } from '@creator-hub/types'

const VERDICT_TONE: Record<TDistributionLabel, NonNullable<VerdictBadgeProps['tone']>> = {
  'faible':       'danger',
  'moyen':        'warning',
  'bon':          'success',
  'tres-fort':    'success',
  'exceptionnel': 'success',
}

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

  const [{ data: post }, { data: metrics }, perfResult, contentAnalysis] = await Promise.all([
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
    getPostContentAnalysis(supabase, id),
  ])

  if (!post) notFound()

  // Hero preview: fetch the raw Meta media row matching this post's media_id
  // and reuse the same extractor as PostExplorer / WhatToDoNext. raw_json
  // carries media_url + thumbnail_url — Meta CDN URLs that rotate, so the
  // client component falls back to a placeholder on onError.
  let previewUrl: string | null = null
  if (post.media_id) {
    const { data: rawMedia } = await supabase
      .from('raw_instagram_media')
      .select('raw_json')
      .eq('media_id', post.media_id)
      .maybeSingle()
    if (rawMedia) {
      previewUrl = extractPreviewUrls(rawMedia.raw_json, post.media_id).previewUrl
    }
  }

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

  const peerPercentile = await getPeerPercentile(supabase, {
    likes:    totals.likes,
    comments: totals.comments,
  })

  const formatLabel = FORMAT_LABEL[post.media_type] ?? post.media_type
  const postedAtFr = post.posted_at
    ? new Date(post.posted_at).toLocaleDateString('fr-FR', { dateStyle: 'long' })
    : null

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Link href="/analytics" className="transition-colors hover:text-foreground">
              Analytics
            </Link>
            <span aria-hidden>/</span>
            <span>{formatLabel}</span>
          </span>
        }
        title={
          post.caption ?? (
            <span className="italic text-muted-foreground">Sans légende IG</span>
          )
        }
        description={postedAtFr ? `Publié le ${postedAtFr}` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <VerdictBadge tone="neutral" size="md">
              {formatLabel}
            </VerdictBadge>
            {post.permalink && (
              <a
                href={post.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Voir sur Instagram →
              </a>
            )}
          </div>
        }
      />

      {/* Hero preview — image from raw_instagram_media, plain <img> with
          onError fallback (Meta CDN URLs rotate, can't be cached). */}
      <PostMediaPreview
        previewUrl={previewUrl}
        mediaType={post.media_type}
        permalink={post.permalink}
        caption={post.caption}
      />

      {/* Metric cards — Impressions intentionally omitted (deprecated metric). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile label="Reach"        value={totals.reach.toLocaleString('fr-FR')} />
        <KpiTile label="Saves"        value={totals.saves.toLocaleString('fr-FR')}    hint="signal de mémorisation" />
        <KpiTile label="Shares"       value={totals.shares.toLocaleString('fr-FR')}   hint="signal de circulation" />
        <KpiTile label="Likes"        value={totals.likes.toLocaleString('fr-FR')} />
        <KpiTile label="Commentaires" value={totals.comments.toLocaleString('fr-FR')} />
      </div>

      {/* vs format moyen */}
      {perf && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <CardTitle>Score circulation vs format moyen</CardTitle>
              <span className="text-xs text-muted-foreground">
                Baseline {FORMAT_LABEL[perf.mediaType] ?? perf.mediaType} · 30 j
                {perf.formatSampleSize > 0 && (
                  <> · {perf.formatSampleSize} post{perf.formatSampleSize > 1 ? 's' : ''}</>
                )}
              </span>
            </div>
            <CardDescription>
              Score self-relative — compare ce post à ta propre baseline 30 j du même format,
              pas à un benchmark externe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CirculationSummary
              score={engagement.score}
              label={engagement.label}
              dominantSignal={engagement.dominantSignal}
              interpretation={distributionInterpretation(engagement, 'vs ta baseline 30j du même format')}
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
              <p className="mt-3 text-xs text-warning">
                Échantillon faible ({perf.formatSampleSize} post
                {perf.formatSampleSize > 1 ? 's' : ''} dans le format sur 30 j) — la
                baseline est peu stable.
              </p>
            )}

            <p className="mt-3 text-[11px] text-muted-foreground">
              Score mart (référence technique) : {perf.performanceScore}/100
              {' · '}
              Δ {perf.scoreDelta >= 0 ? '+' : ''}{perf.scoreDelta} vs baseline {perf.baselineScore}.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pair francophone — distribution per-follower (read-only). */}
      <PeerPercentileCard payload={peerPercentile} />

      {/* Analyse du contenu (read-only Gemini v2 classification) */}
      <ContentAnalysisCard analysis={contentAnalysis} />

      {/* Reach snapshot.
          We mostly store lifetime snapshots, not true daily deltas. With
          0–1 points, or with multiple points that are flat across reach /
          saves / shares (i.e. the same lifetime value resynced each day),
          the chart would look like a real time-series and mislead. Show an
          honest empty state instead. */}
      {(() => {
        const points = reachSeries.length
        const flat =
          points <= 1 ||
          (
            reachSeries.every(p => p.reach   === reachSeries[0].reach)   &&
            reachSeries.every(p => p.saves   === reachSeries[0].saves)   &&
            reachSeries.every(p => p.shares  === reachSeries[0].shares)
          )

        if (points === 0 || flat) {
          return (
            <Card>
              <CardHeader>
                <CardTitle>Snapshot lifetime</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState
                  title="Historique détaillé indisponible"
                  description="Les métriques affichées sont des snapshots lifetime récupérés à chaque sync — pas une vraie série temporelle quotidienne."
                />
              </CardContent>
            </Card>
          )
        }

        return (
          <Card>
            <CardHeader>
              <CardTitle>Reach dans le temps</CardTitle>
            </CardHeader>
            <CardContent>
              <ReachChart data={reachSeries} />
            </CardContent>
          </Card>
        )
      })()}
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
  score:             number
  label:             TDistributionLabel
  dominantSignal:    TDistributionSignal | null
  interpretation:    string
  hasReach:          boolean
}) {
  const dominantFr = dominantSignal ? DISTRIBUTION_SIGNAL_FR[dominantSignal] : null
  return (
    <div className="rounded-md border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Score circulation</p>
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {hasReach ? `${score}` : '—'}
        </span>
        <span className="text-xs text-muted-foreground">/ 100</span>
        <VerdictBadge tone={VERDICT_TONE[label]}>
          {DISTRIBUTION_LABEL_FR[label]}
        </VerdictBadge>
        {dominantFr && hasReach && (
          <span className="text-[11px] text-muted-foreground">
            Signal dominant : <span className="text-foreground">{dominantFr}</span>
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-card-foreground">{interpretation}</p>
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
    missing                ? 'text-muted-foreground' :
    multiplier == null     ? 'text-muted-foreground' :
    multiplier >= 1.5      ? 'text-success'          :
    multiplier >= 0.8      ? 'text-foreground'       :
                             'text-danger'
  const containerCls = accent
    ? 'border-success/40 bg-success-soft'
    : 'border-border bg-muted/30'

  return (
    <div
      className={`rounded-md border p-3 ${containerCls}`}
      title={accent ? 'Signal dominant pour ce post' : undefined}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>
        {missing ? 'n/a' : multiplier == null ? '—' : `×${multiplier.toFixed(1)}`}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
        {missing ? 'métrique non exposée' : `${fmtK(actual)} vs ${baseline == null ? '—' : fmtK(Math.round(baseline))}`}
      </p>
    </div>
  )
}
