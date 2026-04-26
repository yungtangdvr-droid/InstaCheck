import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { TAnalyticsPeriod } from '@creator-hub/types'
import {
  baselineRatesForPost,
  computeDistributionScore,
  computeFormatRateMedians,
  distributionLabel,
  distributionInterpretation,
  DISTRIBUTION_LABEL_COPY,
  DISTRIBUTION_LABEL_FR,
  DISTRIBUTION_SIGNAL_FR,
  type TDistributionLabel,
  type TDistributionResult,
  type TDistributionSignal,
} from './engagement-score'

type Supabase = SupabaseClient<Database>

function periodFlagColumn(period: TAnalyticsPeriod): 'in_last_7d' | 'in_last_30d' | 'in_last_90d' {
  if (period === 7)  return 'in_last_7d'
  if (period === 30) return 'in_last_30d'
  return 'in_last_90d'
}

// Composite weights for the account-level "Santé de circulation" score (v2).
// Designed so a single great post can't carry the account, and so a high-
// variance account is penalised vs a consistently strong one.
const HEALTH_WEIGHTS = {
  medianPostScore:      0.40,
  pctHighPerformers:    0.30,
  globalShareRateScore: 0.20,
  consistency:          0.10,
} as const

// Threshold above which a post counts as a "high performer" for the
// pct-of-posts component. Aligned with the "Au-dessus de ta baseline" band
// (score ≥ 65 in distributionLabel()).
const HIGH_PERFORMER_THRESHOLD = 65

// Self-relative qualifier shown next to every label render so the UI never
// implies an absolute market judgment. `null` baselinePeriod means we have
// no longer comparison window for the current selection (period == 90 today).
export function baselineQualifierFor(baselinePeriod: 30 | 90 | null): string {
  if (baselinePeriod === 30) return 'vs ta baseline 30j'
  if (baselinePeriod === 90) return 'vs ta baseline 90j'
  return 'vs ton historique récent'
}

export type TAccountEngagementHealth = {
  // v2 composite score 0–100 (no longer a raw average). See HEALTH_WEIGHTS.
  current: {
    score:           number
    label:           TDistributionLabel
    dominantSignal:  TDistributionSignal | null
    hasReach:        boolean
    rates: {
      shares:        number | null
      saves:         number | null
      comments:      number | null
      likes:         number | null
      profileVisits: number | null
    }
    components: {
      medianPostScore:      number
      pctHighPerformers:    number   // 0–100 (= % of posts with score ≥ 65)
      globalShareRateScore: number   // 0–100 (log-scaled vs baseline period)
      consistency:          number   // 0–100 (1 − coeff of variation, clamped)
    }
  }
  baseline:          TDistributionResult | null
  baselinePeriod:    30 | 90 | null
  // Pre-computed qualifier string ("vs ta baseline 30j" / "vs ta baseline 90j"
  // / "vs ton historique récent"). Every UI surface that renders the label
  // must show this next to it.
  baselineQualifier: string
  postCount:         number
  // Posts whose v2 distribution score is ≥ 65 in the period.
  highPerformerCount: number
  interpretation: string
  // Δ vs the longer-window baseline. Null when no baseline window applies.
  scoreDelta:     number | null
}

type MartRow = {
  total_reach:          number | null
  total_saves:          number | null
  total_shares:         number | null
  total_likes:          number | null
  total_comments:       number | null
  total_profile_visits: number | null
}

function sumMetrics(rows: MartRow[]) {
  return rows.reduce(
    (acc, r) => ({
      reach:         acc.reach         + Number(r.total_reach          ?? 0),
      saves:         acc.saves         + Number(r.total_saves          ?? 0),
      shares:        acc.shares        + Number(r.total_shares         ?? 0),
      comments:      acc.comments      + Number(r.total_comments       ?? 0),
      likes:         acc.likes         + Number(r.total_likes          ?? 0),
      profileVisits: acc.profileVisits + Number(r.total_profile_visits ?? 0),
    }),
    { reach: 0, saves: 0, shares: 0, comments: 0, likes: 0, profileVisits: 0 },
  )
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

// Coefficient of variation (stddev / mean) inverted into a 0–100 score.
// 0 variance → 100, very high variance → 0. Returns 100 for < 2 posts because
// variance is undefined and we don't want to penalise sparse periods.
function consistencyScore(values: number[]): number {
  if (values.length < 2) return 100
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  if (mean <= 0) return 0
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  const stddev = Math.sqrt(variance)
  const cv = stddev / mean
  return Math.round(Math.max(0, Math.min(1, 1 - cv)) * 100)
}

const LOG_ANCHOR = Math.log(1 + 4)

// Same log-scaled normalisation as the per-post scoring (computeDistribution
// Score), surfaced here so the global share rate component lives on the same
// 0–100 scale as the median post score.
function globalShareRateScore(
  globalShareRate: number,
  baselineShareRate: number | null,
): number {
  if (baselineShareRate == null || baselineShareRate <= 0) return 0
  if (!Number.isFinite(globalShareRate) || globalShareRate <= 0) return 0
  const ratio = globalShareRate / baselineShareRate
  const normalised = Math.max(0, Math.min(1, Math.log(1 + ratio) / LOG_ANCHOR))
  return Math.round(normalised * 100)
}

/**
 * Aggregate engagement health for the connected account, computed on the
 * currently-selected period using the v2 composite formula:
 *   40% median post distribution score
 *   30% % of posts with score ≥ 65
 *   20% global share rate vs baseline
 *   10% consistency (low variance is rewarded)
 *
 * Compares against a longer baseline window (30 d when period ≤ 30, 90 d when
 * period == 90 falls back to no baseline).
 */
export async function getAccountEngagementHealth(
  supabase: Supabase,
  period: TAnalyticsPeriod,
): Promise<TAccountEngagementHealth> {
  const flag = periodFlagColumn(period)

  const { data: rows } = await supabase
    .from('v_mart_post_performance')
    .select('media_type, total_reach, total_saves, total_shares, total_likes, total_comments, total_profile_visits, baseline_saves, baseline_shares, baseline_comments, baseline_likes, baseline_profile_visits')
    .eq(flag, true)

  const periodRows = rows ?? []
  const aggregate = sumMetrics(periodRows)

  // Same-format median rate fallbacks for the period (used when the per-post
  // baseline is missing). Computed once here, fed into every per-post call.
  const formatRateMedians = computeFormatRateMedians(periodRows)

  // Per-post v2 distribution scores (same logic the post detail page uses).
  // Profile visits is conditionally available — the score function handles
  // re-distribution of its weight when null.
  const perPostScores: number[] = []
  const dominantTallies = new Map<TDistributionSignal, number>()
  for (const r of periodRows) {
    const reach    = Number(r.total_reach    ?? 0)
    if (reach <= 0) continue
    const saves    = Number(r.total_saves    ?? 0)
    const shares   = Number(r.total_shares   ?? 0)
    const comments = Number(r.total_comments ?? 0)
    const likes    = Number(r.total_likes    ?? 0)
    const pv       = r.total_profile_visits == null ? null : Number(r.total_profile_visits)

    const baselineRates = baselineRatesForPost(r, formatRateMedians)
    const result = computeDistributionScore({
      reach,
      shares,
      saves,
      comments,
      likes,
      profileVisits: pv,
      baselineRates,
    })
    perPostScores.push(result.score)
    if (result.dominantSignal) {
      dominantTallies.set(
        result.dominantSignal,
        (dominantTallies.get(result.dominantSignal) ?? 0) + 1,
      )
    }
  }

  const medianPostScore = Math.round(median(perPostScores))
  const highPerformerCount = perPostScores.filter(s => s >= HIGH_PERFORMER_THRESHOLD).length
  const pctHighPerformers = perPostScores.length > 0
    ? Math.round((highPerformerCount / perPostScores.length) * 100)
    : 0
  const consistency = consistencyScore(perPostScores)

  // Global share rate at the account level for the period, vs the baseline
  // window's share rate. Used as a "does the whole account circulate?" check.
  const globalShareRate = aggregate.reach > 0 ? aggregate.shares / aggregate.reach : 0

  // Choose a longer baseline window. For 7 d / 30 d the natural baseline is
  // the 90 d total; for 90 d we don't have a longer window stored, so we
  // fall back to no baseline (delta = null).
  const baselineFlag: 'in_last_30d' | 'in_last_90d' | null =
    period === 7  ? 'in_last_30d' :
    period === 30 ? 'in_last_90d' :
                    null

  let baseline: TDistributionResult | null = null
  let baselinePeriod: 30 | 90 | null = null
  let baselineShareRate: number | null = null

  if (baselineFlag) {
    const { data: baselineRows } = await supabase
      .from('v_mart_post_performance')
      .select('total_reach, total_saves, total_shares, total_likes, total_comments, total_profile_visits')
      .eq(baselineFlag, true)
    if (baselineRows && baselineRows.length > 0) {
      const baselineAggregate = sumMetrics(baselineRows)
      baseline = computeDistributionScore({
        reach:         baselineAggregate.reach,
        shares:        baselineAggregate.shares,
        saves:         baselineAggregate.saves,
        comments:      baselineAggregate.comments,
        likes:         baselineAggregate.likes,
        profileVisits: baselineAggregate.profileVisits > 0 ? baselineAggregate.profileVisits : null,
      })
      baselinePeriod   = baselineFlag === 'in_last_30d' ? 30 : 90
      baselineShareRate = baselineAggregate.reach > 0
        ? baselineAggregate.shares / baselineAggregate.reach
        : null
    }
  }

  const shareRateScore = globalShareRateScore(globalShareRate, baselineShareRate)

  // Composite v2 health score.
  const compositeScore = Math.round(
    HEALTH_WEIGHTS.medianPostScore      * medianPostScore +
    HEALTH_WEIGHTS.pctHighPerformers    * pctHighPerformers +
    HEALTH_WEIGHTS.globalShareRateScore * shareRateScore +
    HEALTH_WEIGHTS.consistency          * consistency,
  )

  const aggregateResult = computeDistributionScore({
    reach:         aggregate.reach,
    shares:        aggregate.shares,
    saves:         aggregate.saves,
    comments:      aggregate.comments,
    likes:         aggregate.likes,
    profileVisits: aggregate.profileVisits > 0 ? aggregate.profileVisits : null,
  })

  // Account-level dominant signal: prefer the per-post tally (what circulates
  // most often) when posts exist; otherwise fall back to the aggregate result.
  const dominantSignal = pickDominantSignal(dominantTallies, aggregateResult.dominantSignal)

  const finalScore = Math.max(0, Math.min(100, compositeScore))
  const finalLabel = distributionLabel(finalScore)

  const synthetic: TDistributionResult = {
    ...aggregateResult,
    score:          finalScore,
    label:          finalLabel,
    dominantSignal,
  }

  const baselineQualifier = baselineQualifierFor(baselinePeriod)

  const interpretation = aggregate.reach > 0
    ? buildHealthInterpretation(finalLabel, dominantSignal, baselineQualifier)
    : distributionInterpretation(synthetic, baselineQualifier)

  const scoreDelta = baseline ? finalScore - baseline.score : null

  return {
    current: {
      score:          finalScore,
      label:          finalLabel,
      dominantSignal,
      hasReach:       aggregate.reach > 0,
      rates: {
        shares:        aggregateResult.rates.shares,
        saves:         aggregateResult.rates.saves,
        comments:      aggregateResult.rates.comments,
        likes:         aggregateResult.rates.likes,
        profileVisits: aggregateResult.rates.profileVisits,
      },
      components: {
        medianPostScore,
        pctHighPerformers,
        globalShareRateScore: shareRateScore,
        consistency,
      },
    },
    baseline,
    baselinePeriod,
    baselineQualifier,
    postCount:        periodRows.length,
    highPerformerCount,
    interpretation,
    scoreDelta,
  }
}

// "Santé de circulation" copy — strategic, mirrors the post-level wording.
// Always self-relative: the head includes the baseline qualifier so the
// reader can never mistake the score for an absolute market judgment.
function buildHealthInterpretation(
  label: TDistributionLabel,
  dominantSignal: TDistributionSignal | null,
  baselineQualifier: string,
): string {
  const head = `${DISTRIBUTION_LABEL_FR[label]} (${baselineQualifier}) — ${DISTRIBUTION_LABEL_COPY[label]}.`
  if (!dominantSignal) return head
  const signalFr = DISTRIBUTION_SIGNAL_FR[dominantSignal]
  // Audience-facing phrasing that differs slightly from the per-post copy:
  // explains the circulation behaviour rather than just naming the signal.
  const tail =
    dominantSignal === 'shares'
      ? `Ton audience partage beaucoup tes posts. Signal dominant : ${signalFr}.`
    : dominantSignal === 'saves'
      ? `Ton audience sauvegarde plus qu'elle ne réagit. Signal dominant : ${signalFr}.`
    : dominantSignal === 'profileVisits'
      ? `Tes posts génèrent beaucoup de visites de profil. Signal dominant : ${signalFr}.`
      : `Signal dominant : ${signalFr}.`
  return `${head} ${tail}`
}

function pickDominantSignal(
  tallies: Map<TDistributionSignal, number>,
  fallback: TDistributionSignal | null,
): TDistributionSignal | null {
  if (tallies.size === 0) return fallback
  let best: TDistributionSignal | null = null
  let bestCount = 0
  for (const [signal, count] of tallies.entries()) {
    if (count > bestCount) {
      bestCount = count
      best = signal
    }
  }
  return best ?? fallback
}

