import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { ContentRecommendationType } from '@creator-hub/types'
import { buildReason, type TReasonContext } from './build-reason'
import { isReasonCode } from './reason-codes'

type Supabase = SupabaseClient<Database>

type TSignalStrength = Database['public']['Enums']['content_recommendation_signal_strength']

// Hard cap on candidate rows fetched in one refresh. The candidate view is
// already filtered by score / sample / coverage / confidence gates (V2 added a
// confidence >= 50 hard gate in migration 0019), so volume is small in practice;
// the cap exists only as a safety net.
const CANDIDATE_FETCH_CAP = 500

export type TRefreshSummary = {
  candidatesFetched: number
  inserted:          number
  skippedDuplicate:  number
  skippedInvalid:    number
}

const VALID_SIGNAL_STRENGTHS: ReadonlySet<TSignalStrength> = new Set([
  'weak',
  'moderate',
  'strong',
])

function isSignalStrength(v: unknown): v is TSignalStrength {
  return typeof v === 'string' && VALID_SIGNAL_STRENGTHS.has(v as TSignalStrength)
}

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0)   return 0
  if (n > 100) return 100
  return Math.round(n)
}

/**
 * Read v_post_intelligence_candidates, build a French sentence per row, and
 * INSERT into content_recommendations only when no auto row already exists
 * for the (post_id, type, reason_code) triple.
 *
 * Idempotency strategy
 * --------------------
 * The dedupe identity is `(source='auto', post_id, type, reason_code)`,
 * NOT the formatted reason text. Reason text is sensitive to multiplier
 * drift as the archive backfill lands new metrics — using it as a key
 * would re-emit a row every cron run for the same logical signal.
 *
 * Manual rows (`source='manual'`, written by the existing
 * `upsertRecommendation` server action) are entirely outside this index:
 * they are read past, never updated, never deleted. Migration 0018 adds
 * a partial unique index that enforces this in the database as a final
 * safety net even if two workers race.
 *
 * Never deletes, never updates existing rows.
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
    .select('post_id, type, reason_code, media_type, performance_score, score_delta, saves_multiplier, shares_multiplier, era_index_saves, era_index_shares, primary_theme, format_pattern, days_since_posted, confidence, signal_strength')
    .limit(CANDIDATE_FETCH_CAP)

  if (error) {
    throw new Error(`v_post_intelligence_candidates read failed: ${error.message}`)
  }

  const rows = candidates ?? []
  summary.candidatesFetched = rows.length
  if (rows.length === 0) return summary

  const postIds = Array.from(new Set(rows.map(r => r.post_id).filter((p): p is string => !!p)))

  // One round trip to fetch every existing AUTO recommendation across the
  // affected posts. We never compare against manual rows — manual entries
  // remain authoritative regardless of what the candidate view emits.
  const { data: existingRows, error: existingErr } = await supabase
    .from('content_recommendations')
    .select('post_id, type, reason_code, source')
    .in('post_id', postIds)
    .eq('source', 'auto')

  if (existingErr) {
    throw new Error(`content_recommendations dedupe read failed: ${existingErr.message}`)
  }

  const existingKeys = new Set<string>()
  for (const r of existingRows ?? []) {
    if (!r.reason_code) continue
    existingKeys.add(`${r.post_id}::${r.type}::${r.reason_code}`)
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

    const dedupeKey = `${c.post_id}::${c.type}::${c.reason_code}`
    if (existingKeys.has(dedupeKey)) {
      summary.skippedDuplicate += 1
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

    // The candidate view enforces confidence >= 50 in SQL (migration 0019).
    // We re-clamp defensively here so an unexpectedly missing value never
    // produces a CHECK violation against
    // content_recommendations_auto_has_quality_chk in migration 0020.
    const confidence: number =
      c.confidence == null ? 0 : clampConfidence(Number(c.confidence))
    const signalStrength: TSignalStrength = isSignalStrength(c.signal_strength)
      ? c.signal_strength
      : confidence >= 75 ? 'strong'
      : confidence >= 50 ? 'moderate'
      : 'weak'

    toInsert.push({
      post_id:         c.post_id,
      type:            c.type as ContentRecommendationType,
      reason:          buildReason(ctx),
      source:          'auto',
      reason_code:     c.reason_code,
      confidence,
      signal_strength: signalStrength,
      generated_at:    new Date().toISOString(),
    })
    // Add to the in-memory key set so a second candidate row with the same
    // identity inside this batch (rare but possible) cannot duplicate-insert.
    existingKeys.add(dedupeKey)
  }

  if (toInsert.length === 0) return summary

  const { error: insertErr } = await supabase
    .from('content_recommendations')
    .insert(toInsert)

  if (insertErr) {
    // 23505 = unique_violation. The partial unique index from migration 0018
    // enforces (source='auto', post_id, type, reason_code) at the DB level;
    // a race between two cron runs would land here. Treat as a soft skip
    // rather than a hard failure so the route still returns a useful summary.
    if (insertErr.code === '23505') {
      summary.skippedDuplicate += toInsert.length
      return summary
    }
    throw new Error(`content_recommendations insert failed: ${insertErr.message}`)
  }

  summary.inserted = toInsert.length
  return summary
}
