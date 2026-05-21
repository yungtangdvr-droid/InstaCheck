import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type {
  TCreativePattern,
  TCreativePatternExample,
  TPatternRecommendation,
  TPatternSignalStrength,
} from '@creator-hub/types'

type Supabase = SupabaseClient<Database>

// Hard cap on the index query. With a 4-axis composite key on a single-
// operator account the row count is bounded by the count of distinct
// patterns ever produced (a few hundred at most). 1000 is a safety net.
const PATTERN_LIST_CAP = 1000

// Number of example posts surfaced on the pattern detail page.
export const PATTERN_EXAMPLE_LIMIT = 5

function toRecommendation(value: string | null): TPatternRecommendation | null {
  if (value === 'replicate' || value === 'adapt' || value === 'drop') return value
  return null
}

function toSignalStrength(value: string | null): TPatternSignalStrength {
  if (value === 'strong' || value === 'moderate' || value === 'weak') return value
  return 'weak'
}

function num(value: number | null | undefined, fallback: number): number {
  return value == null ? fallback : Number(value)
}

function numOrNull(value: number | null | undefined): number | null {
  return value == null ? null : Number(value)
}

function mapPatternRow(
  row: Database['public']['Views']['v_creative_pattern_stats']['Row'],
): TCreativePattern | null {
  if (!row.pattern_key || !row.pattern_key_lite) return null
  if (!row.media_type || !row.primary_theme || !row.format_pattern || !row.humor_type) return null
  return {
    patternKey:           row.pattern_key,
    patternKeyLite:       row.pattern_key_lite,
    mediaType:            row.media_type,
    primaryTheme:         row.primary_theme,
    formatPattern:        row.format_pattern,
    humorType:            row.humor_type,
    sampleSize:           num(row.sample_size, 0),
    postsLast90d:         num(row.posts_last_90d, 0),
    meanPerformanceScore: num(row.mean_performance_score, 0),
    meanScoreDelta:       num(row.mean_score_delta, 0),
    meanSavesMultiplier:  numOrNull(row.mean_saves_multiplier),
    meanSharesMultiplier: numOrNull(row.mean_shares_multiplier),
    shareAboveBaseline:   num(row.share_above_baseline, 0),
    bayesAdjustedScore:   num(row.bayes_adjusted_score, 0),
    bayesShrinkageK:      num(row.bayes_shrinkage_k, 10),
    patternConfidence:    num(row.pattern_confidence, 0),
    signalStrength:       toSignalStrength(row.signal_strength),
    recommendation:       toRecommendation(row.recommendation),
  }
}

/**
 * Read every creative pattern surfaced by v_creative_pattern_stats. Sorted
 * by Bayesian-adjusted score desc, sample size desc as a tiebreak.
 *
 * Bucket suppression (sample_size < 4 → recommendation NULL) is computed
 * inside the view; the UI decides whether to render those rows in a
 * separate "insufficient evidence" section.
 */
export async function listPatterns(supabase: Supabase): Promise<TCreativePattern[]> {
  const { data, error } = await supabase
    .from('v_creative_pattern_stats')
    .select('pattern_key, pattern_key_lite, media_type, primary_theme, format_pattern, humor_type, sample_size, posts_last_90d, mean_performance_score, mean_score_delta, mean_saves_multiplier, mean_shares_multiplier, share_above_baseline, bayes_adjusted_score, bayes_shrinkage_k, pattern_confidence, signal_strength, recommendation')
    .order('bayes_adjusted_score', { ascending: false, nullsFirst: false })
    .order('sample_size',          { ascending: false, nullsFirst: false })
    .limit(PATTERN_LIST_CAP)

  if (error) throw new Error(`v_creative_pattern_stats read failed: ${error.message}`)

  const out: TCreativePattern[] = []
  for (const row of data ?? []) {
    const mapped = mapPatternRow(row)
    if (mapped) out.push(mapped)
  }
  return out
}

/**
 * Read one pattern by its key. Returns null when the key doesn't exist —
 * the route uses notFound() on null.
 */
export async function getPatternByKey(
  supabase:   Supabase,
  patternKey: string,
): Promise<TCreativePattern | null> {
  const { data, error } = await supabase
    .from('v_creative_pattern_stats')
    .select('pattern_key, pattern_key_lite, media_type, primary_theme, format_pattern, humor_type, sample_size, posts_last_90d, mean_performance_score, mean_score_delta, mean_saves_multiplier, mean_shares_multiplier, share_above_baseline, bayes_adjusted_score, bayes_shrinkage_k, pattern_confidence, signal_strength, recommendation')
    .eq('pattern_key', patternKey)
    .maybeSingle()

  if (error) throw new Error(`v_creative_pattern_stats lookup failed: ${error.message}`)
  if (!data)  return null
  return mapPatternRow(data)
}

/**
 * Top examples for a pattern, ranked by performance_score desc inside the
 * view. We trust the view's row_number for pagination semantics rather
 * than re-sorting in JS.
 */
export async function getPatternExamples(
  supabase:   Supabase,
  patternKey: string,
  limit:      number = PATTERN_EXAMPLE_LIMIT,
): Promise<TCreativePatternExample[]> {
  const { data, error } = await supabase
    .from('v_creative_pattern_examples')
    .select('pattern_key, post_id, posted_at, media_type, performance_score, score_delta, saves_multiplier, shares_multiplier, rank_in_pattern')
    .eq('pattern_key', patternKey)
    .lte('rank_in_pattern', limit)
    .order('rank_in_pattern', { ascending: true })

  if (error) throw new Error(`v_creative_pattern_examples read failed: ${error.message}`)

  const out: TCreativePatternExample[] = []
  for (const row of data ?? []) {
    if (!row.pattern_key || !row.post_id || row.performance_score == null) continue
    out.push({
      patternKey:       row.pattern_key,
      postId:           row.post_id,
      postedAt:         row.posted_at,
      mediaType:        row.media_type,
      performanceScore: Number(row.performance_score),
      scoreDelta:       row.score_delta       == null ? null : Number(row.score_delta),
      savesMultiplier:  row.saves_multiplier  == null ? null : Number(row.saves_multiplier),
      sharesMultiplier: row.shares_multiplier == null ? null : Number(row.shares_multiplier),
      rankInPattern:    Number(row.rank_in_pattern ?? 0),
    })
  }
  return out
}

/**
 * Fetch the posts (caption, permalink, posted_at) for a list of post ids.
 * Used by the pattern detail page so example tiles can render text, since
 * V1 deliberately skips thumbnails (would require parsing raw_json).
 */
export async function getPatternExamplePostMeta(
  supabase: Supabase,
  postIds:  string[],
): Promise<
  Map<string, { caption: string | null; permalink: string | null; mediaType: string }>
> {
  const out = new Map<
    string,
    { caption: string | null; permalink: string | null; mediaType: string }
  >()
  if (postIds.length === 0) return out

  const { data, error } = await supabase
    .from('posts')
    .select('id, caption, permalink, media_type')
    .in('id', postIds)

  if (error) throw new Error(`posts lookup failed: ${error.message}`)

  for (const row of data ?? []) {
    out.set(row.id, {
      caption:   row.caption ?? null,
      permalink: row.permalink ?? null,
      mediaType: row.media_type ?? 'UNKNOWN',
    })
  }
  return out
}
