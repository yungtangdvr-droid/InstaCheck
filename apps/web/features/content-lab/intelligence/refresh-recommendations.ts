import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { ContentRecommendationType } from '@creator-hub/types'
import { buildReason, type TReasonContext } from './build-reason'
import { isReasonCode } from './reason-codes'

type Supabase = SupabaseClient<Database>

// Hard cap on candidate rows fetched in one refresh. The candidate view is
// already filtered by score / sample / coverage gates, so volume is small in
// practice; the cap exists only as a safety net.
const CANDIDATE_FETCH_CAP = 500

// Dedupe horizon. The writer skips inserting a row when an existing
// `content_recommendations` row with the same (post_id, type, reason) was
// created within the last DEDUPE_DAYS days. This is the only mechanism used
// to prevent duplicates — there is no DELETE, no UPDATE.
const DEDUPE_DAYS = 14

export type TRefreshSummary = {
  candidatesFetched: number
  inserted:          number
  skippedDuplicate:  number
  skippedInvalid:    number
}

/**
 * Read v_post_intelligence_candidates, build a French sentence per row,
 * and INSERT into content_recommendations only when no identical row
 * (same post_id, same type, same reason) exists within the last
 * DEDUPE_DAYS days. Never deletes, never updates existing rows. Manual
 * recommendations from `upsertRecommendation` are untouched because their
 * reason text differs from the deterministic auto-generated sentences.
 */
export async function refreshContentRecommendations(
  supabase: Supabase,
): Promise<TRefreshSummary> {
  const summary: TRefreshSummary = {
    candidatesFetched: 0,
    inserted:          0,
    skippedDuplicate:  0,
    skippedInvalid:    0,
  }

  const { data: candidates, error } = await supabase
    .from('v_post_intelligence_candidates')
    .select('post_id, type, reason_code, media_type, performance_score, score_delta, saves_multiplier, shares_multiplier, era_index_saves, era_index_shares, primary_theme, format_pattern, days_since_posted')
    .limit(CANDIDATE_FETCH_CAP)

  if (error) {
    throw new Error(`v_post_intelligence_candidates read failed: ${error.message}`)
  }

  const rows = candidates ?? []
  summary.candidatesFetched = rows.length
  if (rows.length === 0) return summary

  const since = new Date(Date.now() - DEDUPE_DAYS * 24 * 3600 * 1000).toISOString()
  const postIds = Array.from(new Set(rows.map(r => r.post_id).filter((p): p is string => !!p)))

  // Pull every recent recommendation row for the affected posts in one round
  // trip. `(post_id, type, reason)` is the dedupe key built locally below.
  const { data: existingRows, error: existingErr } = await supabase
    .from('content_recommendations')
    .select('post_id, type, reason, created_at')
    .in('post_id', postIds)
    .gte('created_at', since)

  if (existingErr) {
    throw new Error(`content_recommendations dedupe read failed: ${existingErr.message}`)
  }

  const existingKeys = new Set<string>()
  for (const r of existingRows ?? []) {
    existingKeys.add(`${r.post_id}::${r.type}::${r.reason}`)
  }

  type Insert = Database['public']['Tables']['content_recommendations']['Insert']
  const toInsert: Insert[] = []

  for (const c of rows) {
    if (!c.post_id || !c.type) {
      summary.skippedInvalid += 1
      continue
    }
    if (!isReasonCode(c.reason_code)) {
      summary.skippedInvalid += 1
      continue
    }

    const ctx: TReasonContext = {
      reasonCode:        c.reason_code,
      mediaType:         c.media_type ?? 'UNKNOWN',
      performanceScore:  c.performance_score == null ? null : Number(c.performance_score),
      scoreDelta:        c.score_delta       == null ? null : Number(c.score_delta),
      savesMultiplier:   c.saves_multiplier  == null ? null : Number(c.saves_multiplier),
      sharesMultiplier:  c.shares_multiplier == null ? null : Number(c.shares_multiplier),
      eraIndexSaves:     c.era_index_saves   == null ? null : Number(c.era_index_saves),
      eraIndexShares:    c.era_index_shares  == null ? null : Number(c.era_index_shares),
      primaryTheme:      c.primary_theme,
      formatPattern:     c.format_pattern,
      daysSincePosted:   c.days_since_posted == null ? null : Number(c.days_since_posted),
    }

    const reason = buildReason(ctx)
    const key    = `${c.post_id}::${c.type}::${reason}`

    if (existingKeys.has(key)) {
      summary.skippedDuplicate += 1
      continue
    }

    toInsert.push({
      post_id: c.post_id,
      type:    c.type as ContentRecommendationType,
      reason,
    })
    // Add to the in-memory key set so a second candidate row with the same
    // generated sentence inside this batch (rare but possible) does not
    // produce a duplicate insert.
    existingKeys.add(key)
  }

  if (toInsert.length === 0) return summary

  const { error: insertErr } = await supabase
    .from('content_recommendations')
    .insert(toInsert)

  if (insertErr) {
    throw new Error(`content_recommendations insert failed: ${insertErr.message}`)
  }

  summary.inserted = toInsert.length
  return summary
}
