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
import { POST_SCORE_WEIGHTS } from '@creator-hub/types'

type Supabase = SupabaseClient<Database>

function periodStart(period: TAnalyticsPeriod): string {
  const d = new Date()
  d.setDate(d.getDate() - period)
  return d.toISOString().split('T')[0]
}

/**
 * Daily totals for reach, saves, shares, likes, comments within the period.
 * Aggregates all posts per date.
 * Data source: post_metrics_daily (real data from Sprint 1 ingestion).
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
 * Aggregate reach/saves/shares grouped by media_type for posts published in the period.
 * Two-query join in JS because FK relationships are not declared in generated types.
 */
export async function getFormatBreakdown(
  supabase: Supabase,
  period: TAnalyticsPeriod,
): Promise<ActionResult<TFormatSummary[]>> {
  const from = periodStart(period)

  const { data: posts, error: postsErr } = await supabase
    .from('posts')
    .select('id, media_type')
    .gte('posted_at', from)

  if (postsErr) return { data: null, error: postsErr.message }
  if (!posts || posts.length === 0) return { data: [], error: null }

  const postIds     = posts.map(p => p.id)
  const typeByPost  = new Map(posts.map(p => [p.id, p.media_type]))
  const countByType = new Map<string, number>()
  for (const p of posts) {
    countByType.set(p.media_type, (countByType.get(p.media_type) ?? 0) + 1)
  }

  const { data: metrics, error: metricsErr } = await supabase
    .from('post_metrics_daily')
    .select('post_id, reach, saves, shares')
    .in('post_id', postIds)

  if (metricsErr) return { data: null, error: metricsErr.message }

  const byFormat = new Map<string, TFormatSummary>()
  for (const m of metrics ?? []) {
    const type = typeByPost.get(m.post_id) ?? 'UNKNOWN'
    const existing = byFormat.get(type)
    if (existing) {
      existing.reach  += m.reach  ?? 0
      existing.saves  += m.saves  ?? 0
      existing.shares += m.shares ?? 0
    } else {
      byFormat.set(type, {
        mediaType: type,
        count:     countByType.get(type) ?? 0,
        reach:     m.reach  ?? 0,
        saves:     m.saves  ?? 0,
        shares:    m.shares ?? 0,
      })
    }
  }

  return { data: Array.from(byFormat.values()), error: null }
}

/**
 * Average saves per (day-of-week × hour) based on posts published in the period.
 * Used to populate the BestWindowHeatmap.
 */
export async function getPostingWindows(
  supabase: Supabase,
  period: TAnalyticsPeriod,
): Promise<ActionResult<TPostingWindow[]>> {
  const from = periodStart(period)

  const { data: posts, error: postsErr } = await supabase
    .from('posts')
    .select('id, posted_at')
    .gte('posted_at', from)
    .not('posted_at', 'is', null)

  if (postsErr) return { data: null, error: postsErr.message }
  if (!posts || posts.length === 0) return { data: [], error: null }

  const postIds    = posts.map(p => p.id)
  const timeByPost = new Map(posts.map(p => [p.id, p.posted_at!]))

  const { data: metrics, error: metricsErr } = await supabase
    .from('post_metrics_daily')
    .select('post_id, saves')
    .in('post_id', postIds)

  if (metricsErr) return { data: null, error: metricsErr.message }

  const windows = new Map<string, { dayOfWeek: number; hour: number; totalSaves: number; count: number }>()
  for (const m of metrics ?? []) {
    const postedAt = timeByPost.get(m.post_id)
    if (!postedAt) continue
    const d   = new Date(postedAt)
    const key = `${d.getDay()}-${d.getHours()}`
    const existing = windows.get(key)
    if (existing) {
      existing.totalSaves += m.saves ?? 0
      existing.count      += 1
    } else {
      windows.set(key, {
        dayOfWeek:  d.getDay(),
        hour:       d.getHours(),
        totalSaves: m.saves ?? 0,
        count:      1,
      })
    }
  }

  const result: TPostingWindow[] = Array.from(windows.values()).map(w => ({
    dayOfWeek: w.dayOfWeek,
    hour:      w.hour,
    savesAvg:  w.count > 0 ? w.totalSaves / w.count : 0,
    count:     w.count,
  }))

  return { data: result, error: null }
}

/**
 * Top posts by provisional weighted score.
 *
 * NOTE: provisional — uses POST_SCORE_WEIGHTS directly against raw totals,
 * normalised to 0–100 within the current dataset.
 * Will be replaced by mart_post_performance (dbt) once the mart is wired in.
 */
export async function getTopPosts(
  supabase: Supabase,
  period: TAnalyticsPeriod,
  limit = 20,
): Promise<ActionResult<TTopPost[]>> {
  const from = periodStart(period)

  const { data: posts, error: postsErr } = await supabase
    .from('posts')
    .select('id, media_id, media_type, caption, permalink, posted_at')
    .gte('posted_at', from)

  if (postsErr) return { data: null, error: postsErr.message }
  if (!posts || posts.length === 0) return { data: [], error: null }

  const postIds = posts.map(p => p.id)

  const { data: metrics, error: metricsErr } = await supabase
    .from('post_metrics_daily')
    .select('post_id, reach, saves, shares, likes, comments, profile_visits')
    .in('post_id', postIds)

  if (metricsErr) return { data: null, error: metricsErr.message }

  const totals = new Map<string, {
    reach: number; saves: number; shares: number
    likes: number; comments: number; profileVisits: number
  }>()

  for (const m of metrics ?? []) {
    const t = totals.get(m.post_id)
    if (t) {
      t.reach         += m.reach          ?? 0
      t.saves         += m.saves          ?? 0
      t.shares        += m.shares         ?? 0
      t.likes         += m.likes          ?? 0
      t.comments      += m.comments       ?? 0
      t.profileVisits += m.profile_visits ?? 0
    } else {
      totals.set(m.post_id, {
        reach:         m.reach          ?? 0,
        saves:         m.saves          ?? 0,
        shares:        m.shares         ?? 0,
        likes:         m.likes          ?? 0,
        comments:      m.comments       ?? 0,
        profileVisits: m.profile_visits ?? 0,
      })
    }
  }

  const combined: TTopPost[] = posts.map(p => {
    const t = totals.get(p.id) ?? { reach: 0, saves: 0, shares: 0, likes: 0, comments: 0, profileVisits: 0 }
    const rawScore =
      t.saves         * POST_SCORE_WEIGHTS.saves +
      t.shares        * POST_SCORE_WEIGHTS.shares +
      t.comments      * POST_SCORE_WEIGHTS.comments +
      t.likes         * POST_SCORE_WEIGHTS.likes +
      t.profileVisits * POST_SCORE_WEIGHTS.profileVisits
    return {
      id:            p.id,
      mediaId:       p.media_id,
      mediaType:     p.media_type,
      caption:       p.caption,
      permalink:     p.permalink,
      postedAt:      p.posted_at,
      reach:         t.reach,
      saves:         t.saves,
      shares:        t.shares,
      likes:         t.likes,
      comments:      t.comments,
      profileVisits: t.profileVisits,
      score:         rawScore,
    }
  })

  const maxRaw = Math.max(...combined.map(p => p.score), 1)
  for (const p of combined) {
    p.score = Math.round((p.score / maxRaw) * 100)
  }
  combined.sort((a, b) => b.score - a.score)

  return { data: combined.slice(0, limit), error: null }
}
