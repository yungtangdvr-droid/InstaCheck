// Read-only peer percentile feature for /analytics/post/[id].
//
// Joins the owner's latest followers snapshot with the
// `v_mart_benchmark_peer_percentile` view to produce per-metric
// percentile points (likes-per-follower, comments-per-follower).
//
// Doctrine — see supabase/migrations/0010_benchmark_peer_percentile_mart.sql:
//   * Public benchmark metrics only (likes, comments).
//   * `aspirational` cohort already excluded by the view.
//   * No score aggregation across metrics — the per-metric
//     percentile IS the readout.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type {
  TBenchmarkCohort,
  TPeerPercentileMetric,
  TPeerPercentilePayload,
  TPeerPercentilePoint,
} from '@creator-hub/types'

type Supabase = SupabaseClient<Database>

// Below this sample size (peer media rows contributing to the
// metric) the percentile is hidden behind an `insufficient = true`
// flag. Tuned with the manager: 30.
const MIN_SAMPLE_SIZE = 30

export type TPostLikeCommentTotals = {
  likes:    number
  comments: number
}

const POOL_COHORTS: TBenchmarkCohort[] = ['core_peer', 'french_francophone']
const POOL_FOLLOWERS_FLOOR   = 20000
const POOL_FOLLOWERS_CEILING = 800000

/**
 * Compute the owner's percentile rank within a sorted ascending
 * sample, using the average of strict-less-than and less-or-equal
 * counts (manager rule). Returns a value in [0, 100].
 *
 * Examples (sample = [1, 2, 2, 3, 4]):
 *   ownerRate = 2   → strictly_less=1, le=3 → (1+3)/2 / 5 = 40
 *   ownerRate = 0.5 → strictly_less=0, le=0 → 0
 *   ownerRate = 5   → strictly_less=5, le=5 → 100
 */
export function computePercentile(
  sortedRates: readonly number[],
  ownerRate:   number,
): number {
  const n = sortedRates.length
  if (n === 0) return 0

  // Sample is sorted asc; binary-search both bounds for O(log n).
  const lt = lowerBound(sortedRates, ownerRate)         // count strictly less
  const le = upperBound(sortedRates, ownerRate)         // count <= ownerRate
  const avg = (lt + le) / 2
  const pct = (avg / n) * 100

  if (pct < 0)   return 0
  if (pct > 100) return 100
  return pct
}

function lowerBound(arr: readonly number[], target: number): number {
  let lo = 0, hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid] < target) lo = mid + 1
    else                   hi = mid
  }
  return lo
}

function upperBound(arr: readonly number[], target: number): number {
  let lo = 0, hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid] <= target) lo = mid + 1
    else                    hi = mid
  }
  return lo
}

function toFiniteNumber(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : null
}

function normalizeRates(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const r of raw) {
    const n = toFiniteNumber(r)
    if (n != null) out.push(n)
  }
  out.sort((a, b) => a - b)
  return out
}

/**
 * Fetch peer-percentile distributions and combine with the owner's
 * current totals to produce per-metric percentile points. Soft-fails
 * on any read error: returns a payload with `metrics: []` and the
 * caller renders the appropriate empty state.
 */
export async function getPeerPercentile(
  supabase: Supabase,
  totals:   TPostLikeCommentTotals,
): Promise<TPeerPercentilePayload> {
  const generatedAt = new Date().toISOString()

  // Latest owner followers snapshot. Source: raw_instagram_account_daily —
  // the same table the audience page reads from.
  const { data: ownerSnapshot } = await supabase
    .from('raw_instagram_account_daily')
    .select('followers_count, date')
    .order('date',      { ascending: false })
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const ownerFollowers = toFiniteNumber(ownerSnapshot?.followers_count)

  const { data: rows } = await supabase
    .from('v_mart_benchmark_peer_percentile')
    .select('metric, rates, sample_size, account_count, p50, p90')

  type PercentileRow = NonNullable<typeof rows>[number]
  const byMetric = new Map<TPeerPercentileMetric, PercentileRow>()
  for (const row of rows ?? []) {
    if (row.metric === 'likes' || row.metric === 'comments') {
      byMetric.set(row.metric, row)
    }
  }

  const metrics: TPeerPercentilePoint[] = []

  if (ownerFollowers !== null && ownerFollowers > 0) {
    const ownerRates: Record<TPeerPercentileMetric, number> = {
      likes:    totals.likes    / ownerFollowers,
      comments: totals.comments / ownerFollowers,
    }

    for (const metric of ['likes', 'comments'] as const) {
      const row = byMetric.get(metric)
      const rates       = normalizeRates(row?.rates)
      const sampleSize  = row?.sample_size   ?? rates.length
      const accountCount = row?.account_count ?? 0
      const p50          = toFiniteNumber(row?.p50)
      const p90          = toFiniteNumber(row?.p90)

      const ownerRate    = ownerRates[metric]
      const insufficient = sampleSize < MIN_SAMPLE_SIZE
      const percentile   = insufficient || rates.length === 0
        ? 0
        : computePercentile(rates, ownerRate)

      metrics.push({
        metric,
        ownerRate,
        percentile,
        sampleSize,
        accountCount,
        p50,
        p90,
        insufficient,
      })
    }
  }

  return {
    ownerFollowers,
    pool: {
      followersFloor:   POOL_FOLLOWERS_FLOOR,
      followersCeiling: POOL_FOLLOWERS_CEILING,
      cohorts:          POOL_COHORTS,
    },
    metrics,
    generatedAt,
  }
}
