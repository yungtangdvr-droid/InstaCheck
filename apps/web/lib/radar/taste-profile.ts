// Meme Radar — Yugnat taste profile.
//
// Builds a compact summary of what has performed for the operator
// recently, derived from already-synced Instagram posts. The radar
// scorer injects this once per batch into the user prompt so the
// model can calibrate `yugnat_fit` against the operator's actual
// recent pattern instead of a generic editorial brief.
//
// Source data (read-only):
//   - public.v_mart_post_performance  (performance_score, in_last_90d)
//   - public.post_content_analysis    (primary_theme, format_pattern,
//                                      humor_type, cultural_reference)
//
// The helper returns an empty profile (sampleSize = 0) when there are
// no completed analyses in the window. Callers must skip injection in
// that case so the prompt does not carry a misleading "" block.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

const TASTE_WINDOW_DAYS    = 90
const TASTE_TOP_POSTS      = 30
const TASTE_TOP_THEMES     = 5
const TASTE_TOP_FORMATS    = 5
const TASTE_TOP_HUMOR      = 3
const TASTE_TOP_REFS       = 5

export type RadarTasteEntry = {
  key:            string
  postCount:      number
  avgPerformance: number
}

export type RadarTasteProfile = {
  topThemes:      RadarTasteEntry[]
  topFormats:     RadarTasteEntry[]
  recurringHumor: string[]
  recurringRefs:  string[]
  sampleSize:     number
  windowDays:     number
}

export const EMPTY_TASTE_PROFILE: RadarTasteProfile = {
  topThemes:      [],
  topFormats:     [],
  recurringHumor: [],
  recurringRefs:  [],
  sampleSize:     0,
  windowDays:     TASTE_WINDOW_DAYS,
}

type PerfRow = {
  post_id:           string | null
  performance_score: number | null
}

type AnalysisRow = {
  post_id:            string
  primary_theme:      string | null
  format_pattern:     string | null
  humor_type:         string | null
  cultural_reference: string | null
}

function rankByCount<T>(
  entries: T[],
  keyOf:   (e: T) => string | null,
  topN:    number,
): string[] {
  const counts = new Map<string, number>()
  for (const e of entries) {
    const k = keyOf(e)
    if (!k) continue
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([k]) => k)
}

function aggregateByKey(
  rows:  { key: string | null; perf: number }[],
  topN:  number,
): RadarTasteEntry[] {
  const buckets = new Map<string, { sum: number; count: number }>()
  for (const r of rows) {
    if (!r.key) continue
    const cur = buckets.get(r.key) ?? { sum: 0, count: 0 }
    cur.sum   += r.perf
    cur.count += 1
    buckets.set(r.key, cur)
  }
  return [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      postCount:      b.count,
      avgPerformance: Math.round(b.sum / b.count),
    }))
    // Sort by count first (frequency dominates), then by avgPerformance.
    .sort((a, b) =>
      b.postCount === a.postCount
        ? b.avgPerformance - a.avgPerformance
        : b.postCount - a.postCount,
    )
    .slice(0, topN)
}

export async function getRadarTasteProfile(
  supabase: SupabaseClient<Database>,
): Promise<RadarTasteProfile> {
  // Step 1: pick the top-N performing posts in the 90-day window.
  const { data: perfData, error: perfErr } = await supabase
    .from('v_mart_post_performance')
    .select('post_id,performance_score')
    .eq('in_last_90d', true)
    .order('performance_score', { ascending: false, nullsFirst: false })
    .limit(TASTE_TOP_POSTS)
  if (perfErr) {
    throw new Error(`taste_profile_perf_failed: ${perfErr.message}`)
  }

  const perfRows = (perfData ?? []) as PerfRow[]
  const ids = perfRows
    .map((r) => r.post_id)
    .filter((id): id is string => typeof id === 'string')
  if (ids.length === 0) return EMPTY_TASTE_PROFILE

  const perfById = new Map<string, number>()
  for (const r of perfRows) {
    if (r.post_id && typeof r.performance_score === 'number') {
      perfById.set(r.post_id, r.performance_score)
    }
  }

  // Step 2: join with completed content analyses.
  const { data: analysisData, error: analysisErr } = await supabase
    .from('post_content_analysis')
    .select('post_id,primary_theme,format_pattern,humor_type,cultural_reference')
    .in('post_id', ids)
    .eq('status', 'completed')
  if (analysisErr) {
    throw new Error(`taste_profile_analysis_failed: ${analysisErr.message}`)
  }

  const analyses = (analysisData ?? []) as AnalysisRow[]
  if (analyses.length === 0) return EMPTY_TASTE_PROFILE

  const themeRows  = analyses.map((a) => ({ key: a.primary_theme,  perf: perfById.get(a.post_id) ?? 0 }))
  const formatRows = analyses.map((a) => ({ key: a.format_pattern, perf: perfById.get(a.post_id) ?? 0 }))

  return {
    topThemes:      aggregateByKey(themeRows,  TASTE_TOP_THEMES),
    topFormats:     aggregateByKey(formatRows, TASTE_TOP_FORMATS),
    recurringHumor: rankByCount(analyses, (a) => a.humor_type,         TASTE_TOP_HUMOR),
    recurringRefs:  rankByCount(analyses, (a) => a.cultural_reference, TASTE_TOP_REFS),
    sampleSize:     analyses.length,
    windowDays:     TASTE_WINDOW_DAYS,
  }
}

// Compact text block injected into the radar user prompt. Kept under
// ~200 tokens. Returns null when the profile is empty so callers can
// skip injection cleanly.
export function formatTasteProfileBlock(profile: RadarTasteProfile): string | null {
  if (profile.sampleSize === 0) return null
  const themes  = profile.topThemes.map((t)  => t.key).join(', ')  || '—'
  const formats = profile.topFormats.map((f) => f.key).join(', ') || '—'
  const humor   = profile.recurringHumor.join(', ') || '—'
  const refs    = profile.recurringRefs.join(', ')  || '—'
  return [
    'yugnat_recent_taste:',
    `  top_themes: [${themes}]`,
    `  top_formats: [${formats}]`,
    `  recurring_humor: [${humor}]`,
    `  recurring_refs: [${refs}]`,
    `  sample_size: ${profile.sampleSize}`,
    `  window_days: ${profile.windowDays}`,
  ].join('\n')
}
