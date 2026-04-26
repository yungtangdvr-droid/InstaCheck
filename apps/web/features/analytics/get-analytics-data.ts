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
import { computePercentiles, computeRankScore } from './ranking'
import { extractPreviewUrls } from './media-preview'
import { computeEngagementScore } from './engagement-score'

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
 * Daily totals for reach, saves, shares, likes, comments bucketed by each
 * post's publication day (Europe/Paris), for posts published in the last
 * `period` days.
 *
 * Bucketing is deliberately by `posts.posted_at`, NOT by
 * `post_metrics_daily.date`: the current Meta sync writes lifetime insights
 * with `date = sync_date`, so every post_metrics_daily row shares the same
 * date after a sync. Filtering on that column would make 7 / 30 / 90 days
 * all collapse onto the sync date and render identical series.
 *
 * Publication date is taken in Europe/Paris to match `stg_posts.posted_date_
 * local` (the canonical operator timezone used by the marts).
 */
export async function getReachSeries(
  supabase: Supabase,
  period: TAnalyticsPeriod,
): Promise<ActionResult<TDailyMetricPoint[]>> {
  const from = periodStart(period)

  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id, posted_at')
    .gte('posted_at', from)
    .order('posted_at', { ascending: true })

  if (postsError) return { data: null, error: postsError.message }
  if (!posts || posts.length === 0) return { data: [], error: null }

  const postedAtById = new Map<string, string>()
  for (const p of posts) {
    if (p.posted_at) postedAtById.set(p.id, p.posted_at)
  }

  const postIds = Array.from(postedAtById.keys())
  if (postIds.length === 0) return { data: [], error: null }

  const { data: metrics, error: metricsError } = await supabase
    .from('post_metrics_daily')
    .select('post_id, reach, saves, shares, likes, comments')
    .in('post_id', postIds)

  if (metricsError) return { data: null, error: metricsError.message }

  const byDate = new Map<string, TDailyMetricPoint>()
  for (const row of metrics ?? []) {
    const postedAt = postedAtById.get(row.post_id)
    if (!postedAt) continue
    const date = toParisDate(postedAt)
    const existing = byDate.get(date)
    if (existing) {
      existing.reach    += row.reach    ?? 0
      existing.saves    += row.saves    ?? 0
      existing.shares   += row.shares   ?? 0
      existing.likes    += row.likes    ?? 0
      existing.comments += row.comments ?? 0
    } else {
      byDate.set(date, {
        date,
        reach:    row.reach    ?? 0,
        saves:    row.saves    ?? 0,
        shares:   row.shares   ?? 0,
        likes:    row.likes    ?? 0,
        comments: row.comments ?? 0,
      })
    }
  }

  const result = Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  )

  return { data: result, error: null }
}

// ISO YYYY-MM-DD in Europe/Paris — matches stg_posts.posted_date_local.
// 'en-CA' formats as 'YYYY-MM-DD' which is already sortable as a string.
function toParisDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
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
    mediaType: r.media_type     ?? 'UNKNOWN',
    count:     r.post_count     ?? 0,
    reach:     Number(r.total_reach  ?? 0),
    saves:     Number(r.total_saves  ?? 0),
    shares:    Number(r.total_shares ?? 0),
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
    .select('day_of_week, hour, avg_saves, post_count, sample_confidence, low_sample_flag, media_type')
    .eq('period_days', period)
    .is('media_type', null)

  if (error) return { data: null, error: error.message }

  const result: TPostingWindow[] = (data ?? []).map(r => ({
    dayOfWeek:        isoDowToSundayFirst(r.day_of_week ?? 1),
    hour:             r.hour              ?? 0,
    savesAvg:         r.avg_saves         ?? 0,
    count:            r.post_count        ?? 0,
    sampleConfidence: Number(r.sample_confidence ?? 0),
    lowSample:        r.low_sample_flag   ?? false,
  }))

  return { data: result, error: null }
}

/**
 * Top posts ranked by the UI-side percentile score (ratio vs same-format 30 d
 * baseline, see ranking.ts). Reads v_mart_post_performance for the period
 * flag — WITHOUT a row limit, because percentile needs the whole set — then
 * enriches with media preview URLs from raw_instagram_media.raw_json and
 * slices the top `limit` rows. The mart's clamped `performance_score` is
 * still returned for transparency but no longer drives the ordering.
 *
 * Safety cap at 500 rows: a single account posting daily for a year stays
 * well under that, and the fetch is head:false so we want to bound payload.
 */
const RANKED_POSTS_CAP = 500

export async function getTopPosts(
  supabase: Supabase,
  period: TAnalyticsPeriod,
  limit = 20,
): Promise<ActionResult<TTopPost[]>> {
  const flag = periodFlagColumn(period)

  const { data, error } = await supabase
    .from('v_mart_post_performance')
    .select('post_id, media_id, media_type, caption, permalink, posted_at, total_reach, total_saves, total_shares, total_likes, total_comments, total_profile_visits, performance_score, baseline_score, score_delta, baseline_saves, baseline_shares, baseline_comments, baseline_likes, baseline_profile_visits')
    .eq(flag, true)
    .order('performance_score', { ascending: false })
    .order('post_id', { ascending: true })
    .limit(RANKED_POSTS_CAP)

  if (error) return { data: null, error: error.message }

  const mediaIds = Array.from(
    new Set((data ?? []).map(r => r.media_id).filter((m): m is string => Boolean(m)))
  )

  // raw_instagram_media.raw_json is the Meta /media response captured at last
  // sync. It has media_url + thumbnail_url — Meta serves signed CDN URLs
  // that expire (~24 h for media_url on images, ~10 y for permalink pages).
  // We surface them as best-effort previews; the UI falls back gracefully.
  const previewByMediaId = new Map<string, { previewUrl: string | null; thumbnailUrl: string | null }>()
  if (mediaIds.length > 0) {
    const { data: rawMedia } = await supabase
      .from('raw_instagram_media')
      .select('media_id, raw_json')
      .in('media_id', mediaIds)
    for (const row of rawMedia ?? []) {
      previewByMediaId.set(row.media_id, extractPreviewUrls(row.raw_json, row.media_id))
    }
  }

  const enriched = (data ?? []).map(r => {
    const saves         = Number(r.total_saves    ?? 0)
    const shares        = Number(r.total_shares   ?? 0)
    const likes         = Number(r.total_likes    ?? 0)
    const comments      = Number(r.total_comments ?? 0)
    const profileVisits = Number(r.total_profile_visits ?? 0)

    const baselineSaves         = r.baseline_saves          == null ? null : Number(r.baseline_saves)
    const baselineShares        = r.baseline_shares         == null ? null : Number(r.baseline_shares)
    const baselineComments      = r.baseline_comments       == null ? null : Number(r.baseline_comments)
    const baselineLikes         = r.baseline_likes          == null ? null : Number(r.baseline_likes)
    const baselineProfileVisits = r.baseline_profile_visits == null ? null : Number(r.baseline_profile_visits)

    const rankScore = computeRankScore({
      saves, shares, comments, likes, profileVisits,
      baselineSaves, baselineShares, baselineComments, baselineLikes, baselineProfileVisits,
    })

    const savesMultiplier =
      baselineSaves && baselineSaves > 0 ? saves / baselineSaves : null

    const mediaId = r.media_id ?? ''
    const preview = previewByMediaId.get(mediaId) ?? { previewUrl: null, thumbnailUrl: null }
    const reach   = Number(r.total_reach ?? 0)

    const engagement = computeEngagementScore({
      reach, saves, shares, comments, likes,
      baselineRates:
        baselineSaves != null && baselineShares != null && baselineComments != null && baselineLikes != null && reach > 0
          ? {
              saves:    baselineSaves    / reach,
              shares:   baselineShares   / reach,
              comments: baselineComments / reach,
              likes:    baselineLikes    / reach,
            }
          : undefined,
    })

    return {
      id:              r.post_id    ?? '',
      mediaId,
      mediaType:       r.media_type ?? 'UNKNOWN',
      caption:         r.caption,
      permalink:       r.permalink,
      postedAt:        r.posted_at,
      reach,
      saves,
      shares,
      likes,
      comments,
      profileVisits,
      score:           r.performance_score ?? 0,
      scoreDelta:      r.score_delta       ?? 0,
      savesMultiplier,
      rankScore,
      percentile:      null as number | null,
      previewUrl:      preview.previewUrl,
      thumbnailUrl:    preview.thumbnailUrl,
      engagementScore: engagement.score,
      engagementLabel: engagement.label,
    }
  })

  const withPercentiles = computePercentiles(enriched)

  // Sort by rankScore DESC, falling back to mart score + post_id for a stable
  // order when posts lack baselines (rankScore === null).
  const sorted = withPercentiles.slice().sort((a, b) => {
    const ra = a.rankScore
    const rb = b.rankScore
    if (ra != null && rb != null) return rb - ra
    if (ra != null) return -1
    if (rb != null) return  1
    if (b.score !== a.score) return b.score - a.score
    return a.id.localeCompare(b.id)
  })

  const result: TTopPost[] = sorted.slice(0, limit)

  return { data: result, error: null }
}

/**
 * Per-post baseline + scoring row from v_mart_post_performance. Used by the
 * post detail page to render the "vs format moyen" block. Returns null data
 * when the mart has no row for this post (e.g. format with zero 30d samples).
 */
export type TPostPerformanceRow = {
  performanceScore:      number
  baselineScore:         number
  scoreDelta:            number
  formatSampleSize:      number
  mediaType:             string
  totals: {
    saves:    number
    shares:   number
    comments: number
    likes:    number
  }
  baselines: {
    saves:    number | null
    shares:   number | null
    comments: number | null
    likes:    number | null
  }
  multipliers: {
    saves:    number | null
    shares:   number | null
    comments: number | null
    likes:    number | null
  }
}

export async function getPostPerformance(
  supabase: Supabase,
  postId: string,
): Promise<ActionResult<TPostPerformanceRow | null>> {
  const { data, error } = await supabase
    .from('v_mart_post_performance')
    .select('media_type, total_saves, total_shares, total_comments, total_likes, baseline_saves, baseline_shares, baseline_comments, baseline_likes, format_sample_size, performance_score, baseline_score, score_delta')
    .eq('post_id', postId)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  if (!data)  return { data: null, error: null }

  const ratio = (v: number, b: number | null | undefined): number | null => {
    if (b == null) return null
    const bn = Number(b)
    return bn > 0 ? v / bn : null
  }

  const totalSaves    = Number(data.total_saves    ?? 0)
  const totalShares   = Number(data.total_shares   ?? 0)
  const totalComments = Number(data.total_comments ?? 0)
  const totalLikes    = Number(data.total_likes    ?? 0)

  return {
    data: {
      performanceScore: data.performance_score ?? 0,
      baselineScore:    data.baseline_score    ?? 50,
      scoreDelta:       data.score_delta       ?? 0,
      formatSampleSize: data.format_sample_size ?? 0,
      mediaType:        data.media_type        ?? 'UNKNOWN',
      totals: {
        saves:    totalSaves,
        shares:   totalShares,
        comments: totalComments,
        likes:    totalLikes,
      },
      baselines: {
        saves:    data.baseline_saves    == null ? null : Number(data.baseline_saves),
        shares:   data.baseline_shares   == null ? null : Number(data.baseline_shares),
        comments: data.baseline_comments == null ? null : Number(data.baseline_comments),
        likes:    data.baseline_likes    == null ? null : Number(data.baseline_likes),
      },
      multipliers: {
        saves:    ratio(totalSaves,    data.baseline_saves),
        shares:   ratio(totalShares,   data.baseline_shares),
        comments: ratio(totalComments, data.baseline_comments),
        likes:    ratio(totalLikes,    data.baseline_likes),
      },
    },
    error: null,
  }
}
