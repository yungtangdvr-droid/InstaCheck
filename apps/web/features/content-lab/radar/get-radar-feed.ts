import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { RadarItemDecision } from '@creator-hub/types'

import {
  asRadarClient,
  listActiveSources,
  type RadarItemScoreRow,
  type RadarSourceRow,
} from '@/lib/radar/persist'
import { fetchActiveBriefsBySourceIds } from '@/lib/briefs/persist'

// Window keys exposed on the URL. Mapped to ISO `since` timestamps when the
// page resolves searchParams. Kept narrow so any new value forces an update
// in the filter component too.
export type TRadarWindow = '24h' | '48h' | '7d' | '30d'

export const RADAR_WINDOWS: readonly TRadarWindow[] = ['24h', '48h', '7d', '30d'] as const

const WINDOW_HOURS: Record<TRadarWindow, number> = {
  '24h':  24,
  '48h':  48,
  '7d':   24 * 7,
  '30d':  24 * 30,
}

export const DEFAULT_RADAR_WINDOW: TRadarWindow = '48h'

export function isRadarWindow(value: string | undefined | null): value is TRadarWindow {
  return value != null && (RADAR_WINDOWS as readonly string[]).includes(value)
}

export function radarWindowSince(window: TRadarWindow): string {
  return new Date(Date.now() - WINDOW_HOURS[window] * 3_600_000).toISOString()
}

// Segmented view exposed on the URL. `saved` is the shortlist; `all/new/
// ignored` obey the active window filter, while `saved` ignores the window
// and uses a fixed 30-day lookback on `decision_at`.
export type TRadarView = 'all' | 'saved' | 'new' | 'ignored'

export const RADAR_VIEWS: readonly TRadarView[] = ['all', 'saved', 'new', 'ignored'] as const

export const DEFAULT_RADAR_VIEW: TRadarView = 'all'

export function isRadarView(value: string | undefined | null): value is TRadarView {
  return value != null && (RADAR_VIEWS as readonly string[]).includes(value)
}

// Saved view always uses a fixed lookback regardless of the URL window so
// shortlisted ideas don't silently disappear at the 48h cliff. Mirrors the
// feedback rerank window for consistency.
export const RADAR_SAVED_LOOKBACK_DAYS = 30

export function radarSavedSince(): string {
  return new Date(Date.now() - RADAR_SAVED_LOOKBACK_DAYS * 24 * 3_600_000).toISOString()
}

// Hard cap on the number of cards rendered. Matches the brief.
export const RADAR_DISPLAY_CAP = 100
// Cushion above the display cap so post-join sorting in JS has room to pick
// the strongest 100 by composite even when the DB-side `published_at` order
// puts unscored items at the front of the window.
const RADAR_FETCH_CAP = 200

// Window for the Save/Ignore feedback signal. Decisions older than this are
// ignored when reranking — keeps the rerank reactive to recent operator
// behavior without persisting a decay schedule.
const FEEDBACK_WINDOW_DAYS = 30
// Hard cap on the absolute boost so a single ignored source cannot tank
// every adjacent row from it; only nudges the order.
const FEEDBACK_BOOST_CAP = 8

// Flat row consumed by the page + cards. Numeric score fields are nullable —
// items without a completed score still appear in the feed.
export type RadarFeedRow = {
  id:                 string
  sourceId:           string
  sourceLabel:        string
  title:              string
  url:                string
  imageUrl:           string | null
  summary:            string | null
  publishedAt:        string | null
  createdAt:          string
  decision:           RadarItemDecision
  decisionAt:         string | null

  scoreStatus:        RadarItemScoreRow['status'] | null
  composite:          number | null
  memePotential:      number | null
  yugnatFit:          number | null
  timingUrgency:      number | null
  visualPotential:    number | null
  culturalRelevance:  number | null

  feedbackBoost:             number | null
  feedbackAdjustedComposite: number | null

  whyMemable:         string | null
  memeAngles:         string[]
  captionIdeas:       string[]
  recommendedFormat:  string | null
  culturalReferences: string[]
  primaryTheme:       string | null
  timingWindowHours:  number | null

  sensitivityContext: string[]
  controversyLevel:   string | null
  misinformationRisk: string | null
  legalCaution:       string | null
  tragedyContext:     string | null

  shortReason:        string | null
  provider:           string | null
  model:              string | null
  promptVersion:      string | null

  briefId:            string | null
}

export type RadarFeedKpis = {
  totalInWindow:        number
  scoredInWindow:       number
  avgComposite:         number | null
  topRecommendedFormat: string | null
}

export type RadarFeedSourceOption = {
  id:    string
  label: string
}

export type RadarFeedCounts = {
  all:     number
  saved:   number
  new:     number
  ignored: number
}

export type RadarFeed = {
  items:   RadarFeedRow[]
  kpis:    RadarFeedKpis
  sources: RadarFeedSourceOption[]
  counts:  RadarFeedCounts
}

// `meme_angles` is stored as jsonb. PR 3 writes an array of `{ angle: string }`
// objects, but we accept either object form or plain strings to stay forgiving
// of older rows.
function parseMemeAngles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim()
      if (trimmed) out.push(trimmed)
    } else if (entry && typeof entry === 'object' && 'angle' in entry) {
      const a = (entry as { angle: unknown }).angle
      if (typeof a === 'string' && a.trim()) out.push(a.trim())
    }
  }
  return out
}

// `caption_ideas` lives inside `radar_item_scores.analysis_json` (PR 5 chose
// the no-migration path). The model returns plain strings; we slice to 3 so
// downstream consumers see a stable max length even if the model overshot.
function parseCaptionIdeas(analysisJson: unknown): string[] {
  if (!analysisJson || typeof analysisJson !== 'object') return []
  const raw = (analysisJson as { caption_ideas?: unknown }).caption_ideas
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.trim()) out.push(entry.trim())
    if (out.length === 3) break
  }
  return out
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function compareDesc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return b - a
}

function compareIsoDesc(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (a === b) return 0
  return a < b ? 1 : -1
}

export async function getRadarFeed(
  supabase: SupabaseClient<Database>,
  args:     { sinceIso: string; sourceId?: string; view?: TRadarView },
): Promise<RadarFeed> {
  const view    = args.view ?? DEFAULT_RADAR_VIEW
  const client  = asRadarClient(supabase)
  const sources = await listActiveSources(supabase)
  const sourceLabelById = new Map<string, string>(sources.map((s) => [s.id, s.label]))

  const savedSinceIso = radarSavedSince()

  // Saved view: fetch by `decision='saved'` over the 30-day decision_at
  // window. Ignores the URL window so shortlisted items don't fall off.
  // Other views: fetch by `published_at` over the URL window, then filter
  // in JS by decision when view is 'new' or 'ignored'.
  let itemsQuery = client
    .from('radar_items')
    .select('id,source_id,title,url,image_url,summary,published_at,created_at,decision,decision_at')
    .limit(RADAR_FETCH_CAP)

  if (view === 'saved') {
    itemsQuery = itemsQuery
      .eq('decision', 'saved')
      .gte('decision_at', savedSinceIso)
      .order('decision_at',  { ascending: false, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('id',           { ascending: true })
  } else {
    itemsQuery = itemsQuery
      .gte('published_at', args.sinceIso)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at',   { ascending: false })
      .order('id',           { ascending: true })
    if (view === 'new' || view === 'ignored') {
      itemsQuery = itemsQuery.eq('decision', view)
    }
  }
  if (args.sourceId) itemsQuery = itemsQuery.eq('source_id', args.sourceId)

  const { data: itemsRaw, error: itemsErr } = await itemsQuery
  if (itemsErr) throw new Error(`radar_feed_items_failed: ${itemsErr.message}`)
  const items = itemsRaw ?? []

  const counts = await fetchRadarCounts(client, {
    sinceIso:      args.sinceIso,
    savedSinceIso,
    sourceId:      args.sourceId,
  })

  // Pull recent operator decisions so the rerank can weight by source/theme/
  // format. Window is independent of the active filter window — what's
  // recently saved/ignored should influence the feed regardless.
  const feedbackSinceIso = new Date(
    Date.now() - FEEDBACK_WINDOW_DAYS * 24 * 3_600_000,
  ).toISOString()
  const feedback = await fetchFeedbackSignals(client, feedbackSinceIso)

  const ids = items.map((i) => i.id)
  const scoresById = new Map<string, RadarItemScoreRow>()
  if (ids.length > 0) {
    const { data: scoresRaw, error: scoresErr } = await client
      .from('radar_item_scores')
      .select('*')
      .in('radar_item_id', ids)
    if (scoresErr) throw new Error(`radar_feed_scores_failed: ${scoresErr.message}`)
    for (const row of scoresRaw ?? []) {
      scoresById.set(row.radar_item_id, row)
    }
  }

  // Brief lookup — soft-fails to empty so a briefs-table read error
  // cannot break the radar feed.
  let briefsBySource = new Map<string, { id: string }>()
  if (ids.length > 0) {
    try {
      briefsBySource = await fetchActiveBriefsBySourceIds(supabase, ids)
    } catch {
      briefsBySource = new Map()
    }
  }

  const rows: RadarFeedRow[] = items.map((item) => {
    const score = scoresById.get(item.id) ?? null
    const composite = score?.composite ?? null
    const boost     = composite == null
      ? null
      : computeFeedbackBoost({
          sourceId:          item.source_id,
          primaryTheme:      score?.primary_theme       ?? null,
          recommendedFormat: score?.recommended_format  ?? null,
        }, feedback)
    return {
      id:          item.id,
      sourceId:    item.source_id,
      sourceLabel: sourceLabelById.get(item.source_id) ?? 'Source inconnue',
      title:       item.title,
      url:         item.url,
      imageUrl:    item.image_url ?? null,
      summary:     item.summary,
      publishedAt: item.published_at,
      createdAt:   item.created_at,
      decision:    item.decision,
      decisionAt:  item.decision_at,

      scoreStatus:       score?.status            ?? null,
      composite,
      memePotential:     score?.meme_potential    ?? null,
      yugnatFit:         score?.yugnat_fit        ?? null,
      timingUrgency:     score?.timing_urgency    ?? null,
      visualPotential:   score?.visual_potential  ?? null,
      culturalRelevance: score?.cultural_relevance ?? null,

      feedbackBoost:             boost,
      feedbackAdjustedComposite: composite == null || boost == null ? null : composite + boost,

      whyMemable:         score?.why_memable         ?? null,
      memeAngles:         parseMemeAngles(score?.meme_angles ?? null),
      captionIdeas:       parseCaptionIdeas(score?.analysis_json ?? null),
      recommendedFormat:  score?.recommended_format  ?? null,
      culturalReferences: score?.cultural_references ?? [],
      primaryTheme:       score?.primary_theme       ?? null,
      timingWindowHours:  score?.timing_window_hours ?? null,

      sensitivityContext: score?.sensitivity_context ?? [],
      controversyLevel:   score?.controversy_level   ?? null,
      misinformationRisk: score?.misinformation_risk ?? null,
      legalCaution:       score?.legal_caution      ?? null,
      tragedyContext:     score?.tragedy_context    ?? null,

      shortReason:   score?.short_reason   ?? null,
      provider:      score?.provider       ?? null,
      model:         score?.model          ?? null,
      promptVersion: score?.prompt_version ?? null,

      briefId:       briefsBySource.get(item.id)?.id ?? null,
    }
  })

  // Final ordering happens in JS so `composite NULLS LAST` is honoured even
  // when `published_at` desc would surface unscored items first. We sort by
  // the feedback-adjusted composite so saved themes/sources/formats float;
  // the raw composite is the tiebreaker. In the Saved view, recency of the
  // save matters more than score — the operator wants the freshest entry of
  // their shortlist on top, so `decision_at` becomes the primary key.
  if (view === 'saved') {
    rows.sort((a, b) => {
      const d = compareIsoDesc(a.decisionAt, b.decisionAt)
      if (d !== 0) return d
      const c = compareDesc(a.composite, b.composite)
      if (c !== 0) return c
      return compareIsoDesc(a.publishedAt, b.publishedAt)
    })
  } else {
    rows.sort((a, b) => {
      const adj = compareDesc(a.feedbackAdjustedComposite, b.feedbackAdjustedComposite)
      if (adj !== 0) return adj
      const c = compareDesc(a.composite, b.composite)
      if (c !== 0) return c
      const p = compareIsoDesc(a.publishedAt, b.publishedAt)
      if (p !== 0) return p
      return compareIsoDesc(a.createdAt, b.createdAt)
    })
  }

  const display = rows.slice(0, RADAR_DISPLAY_CAP)

  // KPIs are computed from the full window (not just the displayed slice) so
  // the strip remains accurate when there are more than 100 items.
  const totalInWindow = rows.length
  let scoredInWindow  = 0
  let compositeSum    = 0
  let compositeCount  = 0
  const formatTally   = new Map<string, number>()
  for (const row of rows) {
    if (row.scoreStatus === 'completed') {
      scoredInWindow += 1
      if (row.composite != null) {
        compositeSum   += row.composite
        compositeCount += 1
      }
      if (row.recommendedFormat) {
        formatTally.set(row.recommendedFormat, (formatTally.get(row.recommendedFormat) ?? 0) + 1)
      }
    }
  }

  let topFormat: string | null = null
  let topCount = 0
  for (const [fmt, count] of formatTally) {
    if (count > topCount) { topFormat = fmt; topCount = count }
  }

  const kpis: RadarFeedKpis = {
    totalInWindow,
    scoredInWindow,
    avgComposite:         compositeCount > 0 ? compositeSum / compositeCount : null,
    topRecommendedFormat: topFormat,
  }

  const sourceOptions: RadarFeedSourceOption[] = (sources as RadarSourceRow[])
    .map((s) => ({ id: s.id, label: s.label }))

  return { items: display, kpis, sources: sourceOptions, counts }
}

// Counts shown in the segmented view tabs. `all`, `new`, and `ignored` are
// scoped to the URL window; `saved` is scoped to the fixed 30-day lookback
// on `decision_at`. Source filter applies to all four. Soft-fails to zero so
// a count query failure cannot break the page.
async function fetchRadarCounts(
  client:    ReturnType<typeof asRadarClient>,
  args:      { sinceIso: string; savedSinceIso: string; sourceId?: string },
): Promise<RadarFeedCounts> {
  const empty: RadarFeedCounts = { all: 0, saved: 0, new: 0, ignored: 0 }

  let windowQuery = client
    .from('radar_items')
    .select('decision')
    .gte('published_at', args.sinceIso)
  if (args.sourceId) windowQuery = windowQuery.eq('source_id', args.sourceId)

  let savedQuery = client
    .from('radar_items')
    .select('id', { count: 'exact', head: true })
    .eq('decision', 'saved')
    .gte('decision_at', args.savedSinceIso)
  if (args.sourceId) savedQuery = savedQuery.eq('source_id', args.sourceId)

  const [windowRes, savedRes] = await Promise.all([windowQuery, savedQuery])
  const counts = { ...empty }

  if (!windowRes.error && windowRes.data) {
    for (const row of windowRes.data) {
      counts.all += 1
      if (row.decision === 'new')     counts.new     += 1
      if (row.decision === 'ignored') counts.ignored += 1
    }
  }
  if (!savedRes.error) counts.saved = savedRes.count ?? 0
  return counts
}

// Aggregated decision tallies, keyed by source/theme/format. Each value is
// (saves − ignores) so the boost calculation is a plain weighted sum.
type FeedbackTally = {
  bySource: Map<string, number>
  byTheme:  Map<string, number>
  byFormat: Map<string, number>
}

const EMPTY_FEEDBACK: FeedbackTally = {
  bySource: new Map(),
  byTheme:  new Map(),
  byFormat: new Map(),
}

// Read all decided radar_items in the feedback window plus the score columns
// needed for the per-theme / per-format tallies. `decision` is an enum so we
// can rely on the value being one of the three known strings.
async function fetchFeedbackSignals(
  client:    ReturnType<typeof asRadarClient>,
  sinceIso:  string,
): Promise<FeedbackTally> {
  const { data, error } = await client
    .from('radar_items')
    .select('id,source_id,decision,decision_at')
    .in('decision', ['saved', 'ignored'])
    .gte('decision_at', sinceIso)
  if (error) {
    // Soft-fail: surfacing this as a hard error would break the page over a
    // ranking enhancement. Return an empty tally instead.
    return EMPTY_FEEDBACK
  }
  const decided = data ?? []
  if (decided.length === 0) return EMPTY_FEEDBACK

  const ids = decided.map((d) => d.id)
  const { data: scoreRows, error: scoreErr } = await client
    .from('radar_item_scores')
    .select('radar_item_id,primary_theme,recommended_format')
    .in('radar_item_id', ids)
  if (scoreErr) return EMPTY_FEEDBACK
  const scoreById = new Map<string, { primary_theme: string | null; recommended_format: string | null }>()
  for (const row of scoreRows ?? []) {
    scoreById.set(row.radar_item_id, {
      primary_theme:      row.primary_theme,
      recommended_format: row.recommended_format,
    })
  }

  const bump = (m: Map<string, number>, key: string | null | undefined, delta: number) => {
    if (!key) return
    m.set(key, (m.get(key) ?? 0) + delta)
  }

  const tally: FeedbackTally = {
    bySource: new Map(),
    byTheme:  new Map(),
    byFormat: new Map(),
  }
  for (const d of decided) {
    const delta = d.decision === 'saved' ? 1 : -1
    bump(tally.bySource, d.source_id, delta)
    const s = scoreById.get(d.id)
    if (s) {
      bump(tally.byTheme,  s.primary_theme,      delta)
      bump(tally.byFormat, s.recommended_format, delta)
    }
  }
  return tally
}

// Per-row boost. Weights mirror the importance order for a meme operator:
// theme alignment dominates (the strongest editorial signal), then source,
// then format. Result is clamped to ±FEEDBACK_BOOST_CAP so the rerank only
// nudges, never flips, the underlying composite ordering.
function computeFeedbackBoost(
  row: { sourceId: string; primaryTheme: string | null; recommendedFormat: string | null },
  tally: FeedbackTally,
): number {
  const sourceDelta = tally.bySource.get(row.sourceId)         ?? 0
  const themeDelta  = row.primaryTheme      ? (tally.byTheme.get(row.primaryTheme)        ?? 0) : 0
  const formatDelta = row.recommendedFormat ? (tally.byFormat.get(row.recommendedFormat)  ?? 0) : 0
  const raw = 2 * sourceDelta + 3 * themeDelta + 2 * formatDelta
  return clamp(raw, -FEEDBACK_BOOST_CAP, FEEDBACK_BOOST_CAP)
}

// Shared humanization for `recommended_format` strings coming from the model
// (e.g. `meme_image` → `Meme Image`).
export function humanizeFormat(raw: string | null): string | null {
  if (!raw) return null
  const cleaned = raw.trim()
  if (!cleaned) return null
  return cleaned
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}
