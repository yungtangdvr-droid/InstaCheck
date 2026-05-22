// Meme Brief — candidate selection from radar items.
//
// Selection rules (per the V1 spec):
//   - Prefer radar items with `decision='saved'`.
//   - Fill up to `limit` with recent high-composite scored items.
//   - Skip items with high controversy / misinformation / tragedy
//     signals on the underlying score row.
//   - Skip items that already have a non-discarded brief in the last
//     24h.
//
// Composite-light micro-clustering: items sharing the same
// `primary_theme` AND at least one `cultural_references` value, with
// `published_at` within 24h of the primary, are returned as cluster
// siblings. Deterministic — pure JS, no extra DB calls beyond the
// candidate pool fetch.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

import {
  asRadarClient,
  fetchSourcesByIds,
  type RadarSourceRow,
} from '@/lib/radar/persist'

import { fetchActiveBriefsBySourceIds } from './persist'

const SAVED_LOOKBACK_HOURS    = 30 * 24  // mirrors radar saved view window
const RECENT_LOOKBACK_HOURS   = 72       // recent high-score fill window
const DUPLICATE_WINDOW_HOURS  = 24       // skip if a brief already exists
const RECENT_FETCH_OVERFETCH  = 6        // pool size before filtering
const MIN_RECENT_COMPOSITE    = 55       // floor for the fill bucket
const CLUSTER_WINDOW_HOURS    = 24

export interface BriefCandidateSignal {
  radarItemId:       string
  title:             string
  summary:           string | null
  url:               string
  imageUrl:          string | null
  publishedAt:       string | null
  sourceId:          string
  sourceLabel:       string
  sourceLanguage:    string | null
  sourceDomain:      string
  composite:         number | null
  primaryTheme:      string | null
  culturalReferences: string[]
  clusterSiblings:   Array<{
    radarItemId: string
    title:       string
  }>
}

export interface PickBriefCandidatesArgs {
  limit:           number
  explicitItemId?: string | null
}

export type ExplicitNoOpReason =
  | 'missing_radar_item'
  | 'unsafe_signal'
  | 'already_has_recent_brief'
  | 'missing_required_signal_text'

export interface PickBriefResult {
  candidates:     BriefCandidateSignal[]
  // Only set when `explicitItemId` was provided and the item did not
  // produce a candidate. Distinct, machine-readable reason that the UI
  // can map to a French message — never `explicit_item_skipped_or_unknown`.
  explicitReason: ExplicitNoOpReason | null
}

interface RawCandidateRow {
  id:                  string
  source_id:           string
  title:               string
  url:                 string
  image_url:           string | null
  summary:             string | null
  published_at:        string | null
  decision:            'new' | 'saved' | 'ignored'
  decision_at:         string | null
}

interface ScoreRow {
  radar_item_id:        string
  status:               'pending' | 'completed' | 'failed' | 'skipped'
  composite:            number | null
  primary_theme:        string | null
  cultural_references:  string[] | null
  controversy_level:    string | null
  misinformation_risk:  string | null
  tragedy_context:      string | null
  sensitivity_context:  string[] | null
}

function safeDomain(rawUrl: string | null | undefined): string {
  if (!rawUrl) return ''
  try { return new URL(rawUrl).hostname.replace(/^www\./, '') } catch { return '' }
}

function isUnsafeForBrief(score: ScoreRow | undefined): boolean {
  if (!score) return false
  if (score.controversy_level === 'high')   return true
  if (score.misinformation_risk === 'high') return true
  if ((score.tragedy_context ?? '').trim().length > 0) return true
  const sens = score.sensitivity_context ?? []
  for (const tag of sens) {
    const t = (tag ?? '').toLowerCase()
    if (t === 'tragedy' || t === 'death' || t === 'sexual_violence' || t === 'minor') return true
  }
  return false
}

export async function pickBriefCandidates(
  supabase: SupabaseClient<Database>,
  args:     PickBriefCandidatesArgs,
): Promise<PickBriefResult> {
  const radar  = asRadarClient(supabase)
  const limit  = Math.max(1, Math.min(args.limit, 10))

  // Explicit single-item path used by the radar card "Generate brief"
  // button. Bypasses the composite floor and the saved-vs-recent bucket
  // logic, but still enforces safety and duplicate filters. Returns a
  // typed reason instead of an empty array so the UI can show a
  // human-readable message.
  if (args.explicitItemId) {
    const { data, error } = await radar
      .from('radar_items')
      .select('id,source_id,title,url,image_url,summary,published_at,decision,decision_at')
      .eq('id', args.explicitItemId)
      .maybeSingle()
    if (error) throw new Error(`brief_candidate_lookup_failed: ${error.message}`)
    if (!data) return { candidates: [], explicitReason: 'missing_radar_item' }

    const titleOk   = typeof data.title   === 'string' && data.title.trim().length   > 0
    const urlOk     = typeof data.url     === 'string' && data.url.trim().length     > 0
    const summaryOk = typeof data.summary === 'string' && data.summary.trim().length > 0
    if (!titleOk || (!urlOk && !summaryOk)) {
      return { candidates: [], explicitReason: 'missing_required_signal_text' }
    }

    // Reuse `finalize` but disable the composite floor for the explicit
    // path. Safety + duplicate filters still apply.
    const candidates = await finalize(supabase, [data], 1, { requireComposite: false })
    if (candidates.length > 0) return { candidates, explicitReason: null }

    // finalize() returned 0 → infer why (unsafe vs duplicate) by
    // re-querying the score + brief lookup. This is cheap (already
    // cached patterns in Supabase) and keeps the reason precise.
    const reason = await diagnoseExplicitSkip(supabase, data.id)
    return { candidates: [], explicitReason: reason }
  }

  // Bucket 1: saved within 30d, most recent first.
  const savedSinceIso  = new Date(Date.now() - SAVED_LOOKBACK_HOURS  * 3_600_000).toISOString()
  const recentSinceIso = new Date(Date.now() - RECENT_LOOKBACK_HOURS * 3_600_000).toISOString()

  const savedRes = await radar
    .from('radar_items')
    .select('id,source_id,title,url,image_url,summary,published_at,decision,decision_at')
    .eq('decision', 'saved')
    .gte('decision_at', savedSinceIso)
    .order('decision_at',  { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit * RECENT_FETCH_OVERFETCH)
  if (savedRes.error) throw new Error(`brief_saved_query_failed: ${savedRes.error.message}`)

  // Bucket 2: recent items with composite ≥ MIN_RECENT_COMPOSITE.
  const recentRes = await radar
    .from('radar_items')
    .select('id,source_id,title,url,image_url,summary,published_at,decision,decision_at')
    .gte('published_at', recentSinceIso)
    .neq('decision', 'ignored')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit * RECENT_FETCH_OVERFETCH * 2)
  if (recentRes.error) throw new Error(`brief_recent_query_failed: ${recentRes.error.message}`)

  // Merge keeping saved first, deduping by id.
  const merged: RawCandidateRow[] = []
  const seen = new Set<string>()
  for (const row of (savedRes.data ?? []) as RawCandidateRow[]) {
    if (!seen.has(row.id)) { merged.push(row); seen.add(row.id) }
  }
  for (const row of (recentRes.data ?? []) as RawCandidateRow[]) {
    if (!seen.has(row.id)) { merged.push(row); seen.add(row.id) }
  }
  if (merged.length === 0) return { candidates: [], explicitReason: null }

  const candidates = await finalize(supabase, merged, limit, { requireComposite: true })
  return { candidates, explicitReason: null }
}

async function diagnoseExplicitSkip(
  supabase: SupabaseClient<Database>,
  radarItemId: string,
): Promise<ExplicitNoOpReason> {
  const radar = asRadarClient(supabase)

  const existing = await fetchActiveBriefsBySourceIds(
    supabase,
    [radarItemId],
    DUPLICATE_WINDOW_HOURS,
  )
  if (existing.has(radarItemId)) return 'already_has_recent_brief'

  const { data: score } = await radar
    .from('radar_item_scores')
    .select(
      'radar_item_id,status,composite,primary_theme,cultural_references,controversy_level,misinformation_risk,tragedy_context,sensitivity_context',
    )
    .eq('radar_item_id', radarItemId)
    .maybeSingle()
  if (score && isUnsafeForBrief(score as ScoreRow)) return 'unsafe_signal'

  // Default conservatively if we can't determine more precisely — the
  // most common remaining cause at this point is signal text we cannot
  // brief from. Never emit `explicit_item_skipped_or_unknown`.
  return 'missing_required_signal_text'
}

interface FinalizeOptions {
  // When false, allow non-saved items even if composite is missing or
  // below MIN_RECENT_COMPOSITE — used by the explicit single-item path.
  requireComposite: boolean
}

async function finalize(
  supabase: SupabaseClient<Database>,
  rows:     RawCandidateRow[],
  limit:    number,
  opts:     FinalizeOptions = { requireComposite: true },
): Promise<BriefCandidateSignal[]> {
  const radar = asRadarClient(supabase)
  const ids   = rows.map((r) => r.id)

  const scoresRes = await radar
    .from('radar_item_scores')
    .select(
      'radar_item_id,status,composite,primary_theme,cultural_references,controversy_level,misinformation_risk,tragedy_context,sensitivity_context',
    )
    .in('radar_item_id', ids)
  if (scoresRes.error) throw new Error(`brief_scores_query_failed: ${scoresRes.error.message}`)
  const scoresById = new Map<string, ScoreRow>()
  for (const row of (scoresRes.data ?? []) as ScoreRow[]) {
    scoresById.set(row.radar_item_id, row)
  }

  const sources = await fetchSourcesByIds(supabase, [...new Set(rows.map((r) => r.source_id))])

  const existingBriefs = await fetchActiveBriefsBySourceIds(
    supabase,
    ids,
    DUPLICATE_WINDOW_HOURS,
  )

  // Filter: skip duplicates, unsafe, completely unscored saved items, and
  // recent items below the composite floor that are not saved.
  type Candidate = RawCandidateRow & { _score: ScoreRow | undefined }
  const filtered: Candidate[] = []
  for (const r of rows) {
    if (existingBriefs.has(r.id)) continue
    const score = scoresById.get(r.id)
    if (isUnsafeForBrief(score)) continue
    if (r.decision !== 'saved' && opts.requireComposite) {
      if (!score || score.status !== 'completed') continue
      const c = score.composite
      if (c == null || c < MIN_RECENT_COMPOSITE) continue
    }
    filtered.push({ ...r, _score: score })
    if (filtered.length >= limit) break
  }

  if (filtered.length === 0) return []

  // Build cluster index over the broader fetched pool so siblings can be
  // discovered even if they are NOT individually selected. Cluster key is
  // composite of primary_theme + sorted cultural_references intersection;
  // we materialise it pairwise during finalize.
  const byTheme = new Map<string, RawCandidateRow[]>()
  for (const r of rows) {
    const score = scoresById.get(r.id)
    if (!score || score.status !== 'completed') continue
    const theme = score.primary_theme
    if (!theme || theme === 'unknown') continue
    if (!byTheme.has(theme)) byTheme.set(theme, [])
    byTheme.get(theme)!.push(r)
  }

  const result: BriefCandidateSignal[] = []
  for (const c of filtered) {
    const score        = c._score
    const refs         = score?.cultural_references ?? []
    const primaryTheme = score?.primary_theme ?? null
    const siblings: BriefCandidateSignal['clusterSiblings'] = []
    if (primaryTheme && primaryTheme !== 'unknown' && refs.length > 0) {
      const candidates = byTheme.get(primaryTheme) ?? []
      const primaryTs  = c.published_at ? Date.parse(c.published_at) : NaN
      const refSet = new Set(refs.map((r) => r.toLowerCase()))
      for (const cand of candidates) {
        if (cand.id === c.id) continue
        const candScore = scoresById.get(cand.id)
        if (!candScore) continue
        const candRefs = (candScore.cultural_references ?? []).map((r) => r.toLowerCase())
        const hasOverlap = candRefs.some((r) => refSet.has(r))
        if (!hasOverlap) continue
        // 24h window proximity.
        if (Number.isFinite(primaryTs) && cand.published_at) {
          const candTs = Date.parse(cand.published_at)
          if (Number.isFinite(candTs)) {
            const diffHours = Math.abs(primaryTs - candTs) / 3_600_000
            if (diffHours > CLUSTER_WINDOW_HOURS) continue
          }
        }
        siblings.push({ radarItemId: cand.id, title: cand.title })
        if (siblings.length >= 3) break
      }
    }

    const source = sources.get(c.source_id) as RadarSourceRow | undefined
    result.push({
      radarItemId:       c.id,
      title:             c.title,
      summary:           c.summary,
      url:               c.url,
      imageUrl:          c.image_url ?? null,
      publishedAt:       c.published_at,
      sourceId:          c.source_id,
      sourceLabel:       source?.label    ?? 'Source inconnue',
      sourceLanguage:    source?.language ?? null,
      sourceDomain:      safeDomain(source?.url ?? c.url),
      composite:         score?.composite ?? null,
      primaryTheme,
      culturalReferences: refs,
      clusterSiblings:   siblings,
    })
  }

  return result
}
