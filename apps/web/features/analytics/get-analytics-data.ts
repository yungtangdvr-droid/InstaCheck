import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type {
  ActionResult,
  TAnalyticsPeriod,
  TDailyMetricPoint,
  TFormatSummary,
  TPostingWindow,
  TTopPost,
} from '@creator-hub/types'
import { isoDowToSundayFirst } from './utils'

type Supabase = SupabaseClient<Database>

function periodStart(period: TAnalyticsPeriod): string {
  const d = new Date()
  d.setDate(d.getDate() - period)
  return d.toISOString().split('T')[0]
}

function periodFlagColumn(period: TAnalyticsPeriod): 'in_last_7d' | 'in_last_30d' | 'in_last_90d' {
  if (period === 7)  return 'in_last_7d'
  if (period === 30) return 'in_last_30d'
  return 'in_last_90d'
}

/**
 * Daily totals for reach, saves, shares, likes, comments within the period.
 * Aggregates all posts per date.
 * Data source: post_metrics_daily (no mart covers a per-day series yet).
 */
export async function getReachSeries(
  supabase: Supabase,
  period: TAnalyticsPeriod,
): Promise<ActionResult<TDailyMetricPoint[]>> {
  const from = periodStart(period)

  const { data, error } = await supabase
    .from('post_metrics_daily')
    .select('date, reach, saves, shares, likes, comments')
    .gte('date', from)
    .order('date', { ascending: true })

  if (error) return { data: null, error: error.message }

  const byDate = new Map<string, TDailyMetricPoint>()
  for (const row of data ?? []) {
    const existing = byDate.get(row.date)
    if (existing) {
      existing.reach    += row.reach    ?? 0
      existing.saves    += row.saves    ?? 0
      existing.shares   += row.shares   ?? 0
      existing.likes    += row.likes    ?? 0
      existing.comments += row.comments ?? 0
    } else {
      byDate.set(row.date, {
        date:     row.date,
        reach:    row.reach    ?? 0,
        saves:    row.saves    ?? 0,
        shares:   row.shares   ?? 0,
        likes:    row.likes    ?? 0,
        comments: row.comments ?? 0,
      })
    }
  }

  return { data: Array.from(byDate.values()), error: null }
}

/**
 * Aggregate reach/saves/shares grouped by media_type for posts in the period.
 * Reads mart_format_performance (v_mart_format_performance).
 */
export async function getFormatBreakdown(
  supabase: Supabase,
  period: TAnalyticsPeriod,
): Promise<ActionResult<TFormatSummary[]>> {
  const { data, error } = await supabase
    .from('v_mart_format_performance')
    .select('media_type, post_count, total_reach, total_saves, total_shares')
    .eq('period_days', period)

  if (error) return { data: null, error: error.message }

  const result: TFormatSummary[] = (data ?? []).map(r => ({
    mediaType: r.media_type,
    count:     r.post_count,
    reach:     r.total_reach,
    saves:     r.total_saves,
    shares:    r.total_shares,
  }))

  return { data: result, error: null }
}

/**
 * Average saves per (day-of-week × hour) for posts in the period.
 * Reads the all-formats rollup row (media_type IS NULL) from
 * mart_best_posting_windows. Day-of-week is remapped from ISO 1–7
 * (Mon–Sun, Europe/Paris) to 0–6 Sun-first to match BestWindowHeatmap
 * and TPostingWindow. Remap lives only here — not in the component.
 */
export async function getPostingWindows(
  supabase: Supabase,
  period: TAnalyticsPeriod,
): Promise<ActionResult<TPostingWindow[]>> {
  const { data, error } = await supabase
    .from('v_mart_best_posting_windows')
    .select('day_of_week, hour, avg_saves, post_count, media_type')
    .eq('period_days', period)
    .is('media_type', null)

  if (error) return { data: null, error: error.message }

  const result: TPostingWindow[] = (data ?? []).map(r => ({
    dayOfWeek: isoDowToSundayFirst(r.day_of_week),
    hour:      r.hour,
    savesAvg:  r.avg_saves,
    count:     r.post_count,
  }))

  return { data: result, error: null }
}

/**
 * Top posts by weighted performance score.
 * Reads mart_post_performance (v_mart_post_performance) filtered by the
 * period's rolling-window flag. Score is baseline-relative 0–100 (avg ≈ 50)
 * — no longer the dataset-max normalization the provisional JS used.
 */
export async function getTopPosts(
  supabase: Supabase,
  period: TAnalyticsPeriod,
  limit = 20,
): Promise<ActionResult<TTopPost[]>> {
  const flag = periodFlagColumn(period)

  const { data, error } = await supabase
    .from('v_mart_post_performance')
    .select('post_id, media_id, media_type, caption, permalink, posted_at, total_reach, total_saves, total_shares, total_likes, total_comments, total_profile_visits, performance_score')
    .eq(flag, true)
    .order('performance_score', { ascending: false })
    .order('post_id', { ascending: true })
    .limit(limit)

  if (error) return { data: null, error: error.message }

  const result: TTopPost[] = (data ?? []).map(r => ({
    id:            r.post_id,
    mediaId:       r.media_id,
    mediaType:     r.media_type,
    caption:       r.caption,
    permalink:     r.permalink,
    postedAt:      r.posted_at,
    reach:         r.total_reach,
    saves:         r.total_saves,
    shares:        r.total_shares,
    likes:         r.total_likes,
    comments:      r.total_comments,
    profileVisits: r.total_profile_visits,
    score:         r.performance_score,
  }))

  return { data: result, error: null }
}
