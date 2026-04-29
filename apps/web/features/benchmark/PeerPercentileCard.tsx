// Read-only peer-percentile readout for /analytics/post/[id].
//
// Renders one tile per available metric (likes, comments) with the
// owner's per-follower rate, the percentile rank within the peer
// pool, and the p50 / p90 breakpoints for context. Falls back to a
// muted empty state when the owner followers count is missing or
// the peer pool is below MIN_SAMPLE_SIZE.

import type {
  TPeerPercentileMetric,
  TPeerPercentilePayload,
  TPeerPercentilePoint,
} from '@creator-hub/types'
import { cohortLabelFr } from '@/features/benchmark/get-benchmark-overview'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { VerdictBadge, type VerdictBadgeProps } from '@/components/ui/verdict-badge'

const METRIC_LABEL_FR: Record<TPeerPercentileMetric, string> = {
  likes:    'Likes / follower',
  comments: 'Commentaires / follower',
}

type TBucket = 'top10' | 'topQuartile' | 'aboveMedian' | 'belowMedian' | 'lowQuartile'

const BUCKET_LABEL_FR: Record<TBucket, string> = {
  top10:       'Top 10 %',
  topQuartile: 'Top quartile',
  aboveMedian: 'Au-dessus de la médiane',
  belowMedian: 'En dessous de la médiane',
  lowQuartile: 'Quartile bas',
}

const BUCKET_TONE: Record<TBucket, NonNullable<VerdictBadgeProps['tone']>> = {
  top10:       'success',
  topQuartile: 'info',
  aboveMedian: 'neutral',
  belowMedian: 'neutral',
  lowQuartile: 'danger',
}

function bucketFor(percentile: number): TBucket {
  if (percentile >= 90) return 'top10'
  if (percentile >= 75) return 'topQuartile'
  if (percentile >= 50) return 'aboveMedian'
  if (percentile >= 25) return 'belowMedian'
  return 'lowQuartile'
}

export function PeerPercentileCard({ payload }: { payload: TPeerPercentilePayload }) {
  const { ownerFollowers, pool, metrics } = payload

  const cohortBlurb = pool.cohorts.map(cohortLabelFr).join(' + ')
  const followersBlurb =
    `followers ${formatBigNumber(pool.followersFloor)}–${formatBigNumber(pool.followersCeiling)}`

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <CardTitle>Pair francophone — distribution</CardTitle>
          <p className="text-xs text-muted-foreground">
            Cohortes {cohortBlurb} · {followersBlurb}
          </p>
        </div>
        <CardDescription>
          Calculé sur les médias publics des comptes pairs francophones
          (Business Discovery), normalisé par leur followers_count respectif.
          `aspirational` exclu.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {ownerFollowers === null ? (
          <EmptyHint>
            Followers du compte non synchronisés — comparaison peer indisponible.
          </EmptyHint>
        ) : metrics.length === 0 ? (
          <EmptyHint>
            Données peer indisponibles pour ce post.
          </EmptyHint>
        ) : metrics.every(m => m.insufficient) ? (
          <EmptyHint>
            Pool peer insuffisant ({metrics[0].sampleSize} médias &lt; 30 requis).
            Lance plus de probes via la CLI benchmark.
          </EmptyHint>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {metrics.map(point => (
              <PercentileTile key={point.metric} point={point} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PercentileTile({ point }: { point: TPeerPercentilePoint }) {
  const label = METRIC_LABEL_FR[point.metric]

  if (point.insufficient) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-4">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Pool insuffisant (n={point.sampleSize})
        </p>
      </div>
    )
  }

  const bucket   = bucketFor(point.percentile)
  const ownerStr = formatRate(point.ownerRate)
  const p50Str   = point.p50 == null ? '—' : formatRate(point.p50)
  const p90Str   = point.p90 == null ? '—' : formatRate(point.p90)

  return (
    <div className="rounded-md border border-border bg-muted/30 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <VerdictBadge tone={BUCKET_TONE[bucket]}>
          {BUCKET_LABEL_FR[bucket]}
        </VerdictBadge>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {ownerStr}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        P{Math.round(point.percentile)} dans le pool
        <span className="text-muted-foreground"> · n={point.sampleSize} médias / {point.accountCount} comptes</span>
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <span>Médiane <span className="text-foreground tabular-nums">{p50Str}</span></span>
        <span>P90 <span className="text-foreground tabular-nums">{p90Str}</span></span>
      </div>
    </div>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 p-4">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

function formatRate(rate: number): string {
  // Engagement rates are typically 0.0001…0.2 — show enough decimals to
  // distinguish neighbouring values without spamming digits.
  if (!Number.isFinite(rate)) return '—'
  if (rate === 0)             return '0'
  if (rate >= 0.1)            return rate.toFixed(2)
  if (rate >= 0.01)           return rate.toFixed(3)
  return rate.toFixed(4)
}

function formatBigNumber(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)} k`
  return n.toLocaleString('fr-FR')
}
