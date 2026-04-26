import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

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
  topPostId:     string | null
  topPostShares: number
}

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

  const rows: TThemePerformanceRow[] = []
  for (const [theme, acc] of byTheme) {
    if (acc.posts === 0) continue
    rows.push({
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

  // Sort by avg_shares descending — shares is the dominant distribution
  // signal on this account, matching the v2 engagement-score weighting.
  rows.sort((a, b) => b.avgShares - a.avgShares)

  return rows
}
