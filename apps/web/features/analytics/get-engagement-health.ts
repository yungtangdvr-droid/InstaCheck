import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { TAnalyticsPeriod } from '@creator-hub/types'
import {
  computeEngagementScore,
  engagementInterpretation,
  type TEngagementResult,
} from './engagement-score'

type Supabase = SupabaseClient<Database>

function periodFlagColumn(period: TAnalyticsPeriod): 'in_last_7d' | 'in_last_30d' | 'in_last_90d' {
  if (period === 7)  return 'in_last_7d'
  if (period === 30) return 'in_last_30d'
  return 'in_last_90d'
}

export type TAccountEngagementHealth = {
  current:        TEngagementResult
  baseline:       TEngagementResult | null
  baselinePeriod: 30 | 90 | null
  postCount:      number
  interpretation: string
  // Delta vs the baseline window. Null when we couldn't compute a baseline
  // (e.g. selected period is already 90 d or no posts in the longer window).
  scoreDelta:     number | null
}

/**
 * Aggregate engagement health for the connected account, computed on the
 * currently selected period. Compares against a longer baseline window
 * (30 d when period <= 30, 90 d when period == 90 falls back to a same-
 * period baseline = current).
 */
export async function getAccountEngagementHealth(
  supabase: Supabase,
  period: TAnalyticsPeriod,
): Promise<TAccountEngagementHealth> {
  const flag = periodFlagColumn(period)

  const { data: rows } = await supabase
    .from('v_mart_post_performance')
    .select('total_reach, total_saves, total_shares, total_likes, total_comments')
    .eq(flag, true)

  const aggregate = sumMetrics(rows ?? [])
  const current = computeEngagementScore(aggregate)

  // Choose a longer baseline window. For 7 d / 30 d the natural baseline is
  // the 90 d total; for 90 d we don't have a longer window stored, so we
  // fall back to the same set (delta = 0).
  const baselineFlag: 'in_last_30d' | 'in_last_90d' | null =
    period === 7  ? 'in_last_30d' :
    period === 30 ? 'in_last_90d' :
                    null

  let baseline: TEngagementResult | null = null
  let baselinePeriod: 30 | 90 | null = null

  if (baselineFlag) {
    const { data: baselineRows } = await supabase
      .from('v_mart_post_performance')
      .select('total_reach, total_saves, total_shares, total_likes, total_comments')
      .eq(baselineFlag, true)
    if (baselineRows && baselineRows.length > 0) {
      baseline = computeEngagementScore(sumMetrics(baselineRows))
      baselinePeriod = baselineFlag === 'in_last_30d' ? 30 : 90
    }
  }

  const scoreDelta = baseline ? current.score - baseline.score : null

  return {
    current,
    baseline,
    baselinePeriod,
    postCount:      (rows ?? []).length,
    interpretation: engagementInterpretation(current),
    scoreDelta,
  }
}

type MartRow = {
  total_reach:    number | null
  total_saves:    number | null
  total_shares:   number | null
  total_likes:    number | null
  total_comments: number | null
}

function sumMetrics(rows: MartRow[]) {
  return rows.reduce(
    (acc, r) => ({
      reach:    acc.reach    + Number(r.total_reach    ?? 0),
      saves:    acc.saves    + Number(r.total_saves    ?? 0),
      shares:   acc.shares   + Number(r.total_shares   ?? 0),
      comments: acc.comments + Number(r.total_comments ?? 0),
      likes:    acc.likes    + Number(r.total_likes    ?? 0),
    }),
    { reach: 0, saves: 0, shares: 0, comments: 0, likes: 0 },
  )
}
