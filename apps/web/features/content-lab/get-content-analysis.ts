import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { TAnalyticsPeriod } from '@creator-hub/types'
import {
  baselineRatesForPost,
  computeDistributionScore,
  computeFormatRateMedians,
  type TDistributionLabel,
  type TDistributionSignal,
} from '@/features/analytics/engagement-score'
import { extractPreviewUrls } from '@/features/analytics/media-preview'

type Supabase = SupabaseClient<Database>

// Single post_content_analysis row, projected to the columns the UI surfaces.
// Other columns (analysis_json, source_media_url, token counts, error_message,
// provider/model) are intentionally omitted — they belong to batch debugging,
// not the read-only display layer.
export type TPostContentAnalysis = {
  postId:               string
  status:               'pending' | 'completed' | 'failed' | 'skipped'
  visibleText:          string | null
  language:             string | null
  primaryTheme:         string | null
  secondaryThemes:      string[]
  humorType:            string | null
  formatPattern:        string | null
  culturalReference:    string | null
  nicheLevel:           string | null
  replicationPotential: string | null
  confidence:           number | null
  shortReason:          string | null
  promptVersion:        string
  analyzedAt:           string | null
}

// Compact signal projection for table rows / cards. We only need the bare
// minimum to render a chip or column without overloading the layout.
export type TContentSignal = {
  postId:               string
  primaryTheme:         string | null
  formatPattern:        string | null
  replicationPotential: string | null
}

/**
 * Fetch the full analysis row for a single post. Returns null when no row
 * exists or status is not 'completed' — pending / failed / skipped rows
 * carry no data the UI can show.
 */
export async function getPostContentAnalysis(
  supabase: Supabase,
  postId: string,
): Promise<TPostContentAnalysis | null> {
  const { data } = await supabase
    .from('post_content_analysis')
    .select('post_id, status, visible_text, language, primary_theme, secondary_themes, humor_type, format_pattern, cultural_reference, niche_level, replication_potential, confidence, short_reason, prompt_version, analyzed_at')
    .eq('post_id', postId)
    .maybeSingle()

  if (!data) return null
  if (data.status !== 'completed') return null

  return {
    postId:               data.post_id,
    status:               data.status,
    visibleText:          data.visible_text,
    language:             data.language,
    primaryTheme:         data.primary_theme,
    secondaryThemes:      data.secondary_themes ?? [],
    humorType:            data.humor_type,
    formatPattern:        data.format_pattern,
    culturalReference:    data.cultural_reference,
    nicheLevel:           data.niche_level,
    replicationPotential: data.replication_potential,
    confidence:           data.confidence == null ? null : Number(data.confidence),
    shortReason:          data.short_reason,
    promptVersion:        data.prompt_version,
    analyzedAt:           data.analyzed_at,
  }
}

/**
 * Fetch compact signals (theme / format / replication) for a batch of posts.
 * Returns a Map keyed by post_id so callers can do O(1) lookups while
 * iterating their own ranked list. Posts with no completed analysis are
 * simply absent from the map — callers handle that as "no signal yet".
 */
export async function getContentSignalsForPosts(
  supabase: Supabase,
  postIds: string[],
): Promise<Map<string, TContentSignal>> {
  const result = new Map<string, TContentSignal>()
  if (postIds.length === 0) return result

  const { data } = await supabase
    .from('post_content_analysis')
    .select('post_id, status, primary_theme, format_pattern, replication_potential')
    .in('post_id', postIds)
    .eq('status', 'completed')

  for (const row of data ?? []) {
    result.set(row.post_id, {
      postId:               row.post_id,
      primaryTheme:         row.primary_theme,
      formatPattern:        row.format_pattern,
      replicationPotential: row.replication_potential,
    })
  }

  return result
}

export type TThemePerformanceRow = {
  primaryTheme:  string
  postCount:     number
  avgReach:      number
  avgSaves:      number
  avgShares:     number
  // Average performance_score from v_mart_post_performance (0–100, mart-side
  // baseline-relative). Null when none of the joined posts have a mart score.
  avgScore:      number | null
  // Raw per-theme metric (avg circulation score if usable across all themes,
  // otherwise avg shares). Same scale as `globalAverageScore` so the
  // shrinkage formula stays apples-to-apples.
  rawScore:      number
  // Bayesian-shrunk score, on the same scale as `rawScore`. Sort key for the
  // ranking — keeps tiny-sample themes from dominating.
  adjustedScore: number
  // postCount / (postCount + MIN_SAMPLE_SIZE), in [0, 1).
  reliability:   number
  topPostId:     string | null
  topPostShares: number
}

// Minimum sample size used for the Bayesian shrinkage prior. Picked at 5
// because with one viral post the reliability is 1/(1+5)=16 %, so the global
// average dominates and the theme can't game the ranking on a single hit.
export const THEME_MIN_SAMPLE_SIZE = 5

/**
 * Aggregate post_content_analysis × v_mart_post_performance by primary_theme.
 *
 * The current Supabase JS client doesn't expose an aggregate API, so we pull
 * the joined per-post rows (capped) and aggregate in JS. Volume is low —
 * ~100 completed analyses on this account today, well under any reasonable
 * cap. The cap exists only as a future safety net.
 *
 * Themes with `unknown` or null primary_theme are filtered out of the
 * aggregate: they are not actionable signals.
 */
const THEME_AGGREGATE_CAP = 2000

export async function getThemePerformance(
  supabase: Supabase,
): Promise<TThemePerformanceRow[]> {
  const { data: analyses } = await supabase
    .from('post_content_analysis')
    .select('post_id, primary_theme')
    .eq('status', 'completed')
    .not('primary_theme', 'is', null)
    .neq('primary_theme', 'unknown')
    .limit(THEME_AGGREGATE_CAP)

  if (!analyses || analyses.length === 0) return []

  const themeByPostId = new Map<string, string>()
  for (const a of analyses) {
    if (a.primary_theme) themeByPostId.set(a.post_id, a.primary_theme)
  }

  const postIds = Array.from(themeByPostId.keys())
  if (postIds.length === 0) return []

  const { data: perfs } = await supabase
    .from('v_mart_post_performance')
    .select('post_id, total_reach, total_saves, total_shares, performance_score')
    .in('post_id', postIds)

  type Acc = {
    posts:        number
    sumReach:     number
    sumSaves:     number
    sumShares:    number
    sumScore:     number
    scoreCount:   number
    topPostId:    string | null
    topShares:    number
  }
  const byTheme = new Map<string, Acc>()

  for (const row of perfs ?? []) {
    const postId = row.post_id
    if (!postId) continue
    const theme = themeByPostId.get(postId)
    if (!theme) continue

    const reach  = Number(row.total_reach   ?? 0)
    const saves  = Number(row.total_saves   ?? 0)
    const shares = Number(row.total_shares  ?? 0)
    const score  = row.performance_score == null ? null : Number(row.performance_score)

    const acc = byTheme.get(theme) ?? {
      posts: 0, sumReach: 0, sumSaves: 0, sumShares: 0,
      sumScore: 0, scoreCount: 0, topPostId: null, topShares: -1,
    }

    acc.posts     += 1
    acc.sumReach  += reach
    acc.sumSaves  += saves
    acc.sumShares += shares
    if (score != null) {
      acc.sumScore   += score
      acc.scoreCount += 1
    }
    if (shares > acc.topShares) {
      acc.topShares = shares
      acc.topPostId = postId
    }

    byTheme.set(theme, acc)
  }

  type Intermediate = {
    primaryTheme:  string
    postCount:     number
    avgReach:      number
    avgSaves:      number
    avgShares:     number
    avgScore:      number | null
    topPostId:     string | null
    topPostShares: number
  }

  const intermediate: Intermediate[] = []
  for (const [theme, acc] of byTheme) {
    if (acc.posts === 0) continue
    intermediate.push({
      primaryTheme:  theme,
      postCount:     acc.posts,
      avgReach:      Math.round(acc.sumReach  / acc.posts),
      avgSaves:      Math.round(acc.sumSaves  / acc.posts),
      avgShares:     Math.round(acc.sumShares / acc.posts),
      avgScore:      acc.scoreCount > 0 ? Math.round(acc.sumScore / acc.scoreCount) : null,
      topPostId:     acc.topPostId,
      topPostShares: Math.max(acc.topShares, 0),
    })
  }

  if (intermediate.length === 0) return []

  // Decide the metric used as raw_theme_score:
  //   - If every theme has avgScore (the v2 0–100 circulation score), use it.
  //     It's a normalised, baseline-relative quality signal — the cleanest
  //     input to a weighted ranking.
  //   - Otherwise fall back to avgShares so we never mix scales.
  const useScore = intermediate.every(r => r.avgScore != null)
  const rawScoreOf = (r: Intermediate): number =>
    useScore && r.avgScore != null ? r.avgScore : r.avgShares

  // Global average across all classified posts (weighted by post_count, not
  // by theme — otherwise a tiny theme would skew the prior).
  let totalPosts = 0
  let weightedSum = 0
  for (const r of intermediate) {
    totalPosts  += r.postCount
    weightedSum += rawScoreOf(r) * r.postCount
  }
  const globalAverageScore = totalPosts > 0 ? weightedSum / totalPosts : 0

  const rows: TThemePerformanceRow[] = intermediate.map(r => {
    const rawScore     = rawScoreOf(r)
    const reliability  = r.postCount / (r.postCount + THEME_MIN_SAMPLE_SIZE)
    const adjustedScore =
      rawScore * reliability + globalAverageScore * (1 - reliability)
    return {
      primaryTheme:  r.primaryTheme,
      postCount:     r.postCount,
      avgReach:      r.avgReach,
      avgSaves:      r.avgSaves,
      avgShares:     r.avgShares,
      avgScore:      r.avgScore,
      rawScore,
      adjustedScore,
      reliability,
      topPostId:     r.topPostId,
      topPostShares: r.topPostShares,
    }
  })

  // Sort by adjusted score desc — Bayesian shrinkage pulls low-sample themes
  // toward the global mean so a single viral post can't dominate the table.
  rows.sort((a, b) => b.adjustedScore - a.adjustedScore)

  return rows
}

// ---------------------------------------------------------------------------
// Theme Explorer — read-only post grid feeding /content-lab/themes/[theme].
// Pure aggregate over post_content_analysis × v_mart_post_performance ×
// raw_instagram_media. No Gemini calls, no writes.
// ---------------------------------------------------------------------------

export type TThemePost = {
  postId:          string
  permalink:       string | null
  caption:         string | null
  visibleText:     string | null
  mediaType:       string
  postedAt:        string | null
  reach:           number
  saves:           number
  shares:          number
  // Score circulation (v2 — same algorithm as PostExplorer / audience top
  // posts) so the Theme Explorer ranks consistently with the rest of the app.
  circulationScore: number
  circulationLabel: TDistributionLabel
  dominantSignal:   TDistributionSignal | null
  previewUrl:       string | null
  primaryTheme:     string
}

export type TThemePostSort = 'shares' | 'saves' | 'reach' | 'circulation'

export const THEME_POST_SORTS: readonly TThemePostSort[] = [
  'shares',
  'saves',
  'reach',
  'circulation',
] as const

function periodFlagColumn(period: TAnalyticsPeriod): 'in_last_7d' | 'in_last_30d' | 'in_last_90d' {
  if (period === 7)  return 'in_last_7d'
  if (period === 30) return 'in_last_30d'
  return 'in_last_90d'
}

function sortPosts(posts: TThemePost[], sort: TThemePostSort): TThemePost[] {
  const key: (p: TThemePost) => number =
    sort === 'shares'      ? (p) => p.shares :
    sort === 'saves'       ? (p) => p.saves :
    sort === 'reach'       ? (p) => p.reach :
                             (p) => p.circulationScore
  return posts.slice().sort((a, b) => key(b) - key(a))
}

/**
 * Fetch every post classified under `primaryTheme`, joined with mart
 * performance and the raw media row for the preview thumbnail. Filters by
 * period (in_last_*d flag), optional media_type, and a sort key.
 *
 * Volume is bounded by post_content_analysis (≤ THEME_AGGREGATE_CAP) which
 * already excludes pending / failed analyses.
 */
export async function getThemePosts(
  supabase: Supabase,
  primaryTheme: string,
  options: {
    period:     TAnalyticsPeriod
    mediaType?: string | null
    sort?:      TThemePostSort
  },
): Promise<TThemePost[]> {
  const sort = options.sort ?? 'shares'

  const { data: analyses } = await supabase
    .from('post_content_analysis')
    .select('post_id, primary_theme, visible_text')
    .eq('status', 'completed')
    .eq('primary_theme', primaryTheme)
    .limit(THEME_AGGREGATE_CAP)

  if (!analyses || analyses.length === 0) return []

  const visibleTextByPostId = new Map<string, string | null>()
  for (const a of analyses) visibleTextByPostId.set(a.post_id, a.visible_text)
  const postIds = Array.from(visibleTextByPostId.keys())

  const flag = periodFlagColumn(options.period)

  let perfQuery = supabase
    .from('v_mart_post_performance')
    .select('post_id, media_id, media_type, caption, permalink, posted_at, total_reach, total_saves, total_shares, total_likes, total_comments, total_profile_visits, baseline_saves, baseline_shares, baseline_comments, baseline_likes, baseline_profile_visits')
    .in('post_id', postIds)
    .eq(flag, true)

  if (options.mediaType && options.mediaType !== 'ALL') {
    perfQuery = perfQuery.eq('media_type', options.mediaType)
  }

  const { data: perfRows } = await perfQuery

  const rows = perfRows ?? []
  if (rows.length === 0) return []

  // Pull the raw_json blob for each media in one round-trip so we can extract
  // a thumbnail URL the same way PostExplorer / post detail do.
  const mediaIds = rows.map(r => r.media_id).filter((m): m is string => typeof m === 'string')
  const previewByMediaId = new Map<string, string | null>()
  if (mediaIds.length > 0) {
    const { data: rawMedia } = await supabase
      .from('raw_instagram_media')
      .select('media_id, raw_json')
      .in('media_id', mediaIds)
    for (const m of rawMedia ?? []) {
      const { previewUrl } = extractPreviewUrls(m.raw_json, m.media_id)
      previewByMediaId.set(m.media_id, previewUrl)
    }
  }

  // Same baseline-rate logic as PostExplorer / audience: per-format median
  // rates within the active set provide the second-tier baseline.
  const formatRateMedians = computeFormatRateMedians(rows)

  const posts: TThemePost[] = rows.map((r) => {
    const reach    = Number(r.total_reach    ?? 0)
    const saves    = Number(r.total_saves    ?? 0)
    const shares   = Number(r.total_shares   ?? 0)
    const comments = Number(r.total_comments ?? 0)
    const likes    = Number(r.total_likes    ?? 0)
    const pv       = r.total_profile_visits == null ? null : Number(r.total_profile_visits)

    const eng = computeDistributionScore({
      reach,
      shares,
      saves,
      comments,
      likes,
      profileVisits: pv,
      baselineRates: baselineRatesForPost(r, formatRateMedians),
    })

    return {
      postId:           r.post_id ?? '',
      permalink:        r.permalink ?? null,
      caption:          r.caption ?? null,
      visibleText:      visibleTextByPostId.get(r.post_id ?? '') ?? null,
      mediaType:        r.media_type ?? 'UNKNOWN',
      postedAt:         r.posted_at ?? null,
      reach,
      saves,
      shares,
      circulationScore: eng.score,
      circulationLabel: eng.label,
      dominantSignal:   eng.dominantSignal,
      previewUrl:       r.media_id ? previewByMediaId.get(r.media_id) ?? null : null,
      primaryTheme,
    }
  })

  return sortPosts(posts, sort)
}

export type TThemeIndexEntry = {
  primaryTheme: string
  postCount:    number
  // Most recent post date in the theme (used as a "freshness" hint on the index).
  lastPostedAt: string | null
}

/**
 * Lightweight roll-up used by the /content-lab/themes index. Counts only —
 * the heavy per-post join lives in getThemePosts. Excludes 'unknown' /
 * null themes for the same reason getThemePerformance does.
 */
export async function getThemeIndex(supabase: Supabase): Promise<TThemeIndexEntry[]> {
  const { data: analyses } = await supabase
    .from('post_content_analysis')
    .select('post_id, primary_theme, analyzed_at')
    .eq('status', 'completed')
    .not('primary_theme', 'is', null)
    .neq('primary_theme', 'unknown')
    .limit(THEME_AGGREGATE_CAP)

  if (!analyses || analyses.length === 0) return []

  const byTheme = new Map<string, { count: number; last: string | null }>()
  for (const a of analyses) {
    const key = a.primary_theme
    if (!key) continue
    const acc = byTheme.get(key) ?? { count: 0, last: null }
    acc.count += 1
    if (a.analyzed_at && (!acc.last || a.analyzed_at > acc.last)) {
      acc.last = a.analyzed_at
    }
    byTheme.set(key, acc)
  }

  return Array.from(byTheme.entries())
    .map(([primaryTheme, v]) => ({
      primaryTheme,
      postCount:    v.count,
      lastPostedAt: v.last,
    }))
    .sort((a, b) => b.postCount - a.postCount)
}
