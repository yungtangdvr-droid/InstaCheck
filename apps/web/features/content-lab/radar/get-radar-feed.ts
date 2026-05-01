import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { RadarItemDecision } from '@creator-hub/types'

import {
  asRadarClient,
  listActiveSources,
  type RadarItemScoreRow,
  type RadarSourceRow,
} from '@/lib/radar/persist'

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

// Hard cap on the number of cards rendered. Matches the brief.
export const RADAR_DISPLAY_CAP = 100
// Cushion above the display cap so post-join sorting in JS has room to pick
// the strongest 100 by composite even when the DB-side `published_at` order
// puts unscored items at the front of the window.
const RADAR_FETCH_CAP = 200

// Flat row consumed by the page + cards. Numeric score fields are nullable —
// items without a completed score still appear in the feed.
export type RadarFeedRow = {
  id:                 string
  sourceId:           string
  sourceLabel:        string
  title:              string
  url:                string
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

  whyMemable:         string | null
  memeAngles:         string[]
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

export type RadarFeed = {
  items:   RadarFeedRow[]
  kpis:    RadarFeedKpis
  sources: RadarFeedSourceOption[]
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
  args:     { sinceIso: string; sourceId?: string },
): Promise<RadarFeed> {
  const client  = asRadarClient(supabase)
  const sources = await listActiveSources(supabase)
  const sourceLabelById = new Map<string, string>(sources.map((s) => [s.id, s.label]))

  let itemsQuery = client
    .from('radar_items')
    .select('id,source_id,title,url,summary,published_at,created_at,decision,decision_at')
    .gte('published_at', args.sinceIso)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at',   { ascending: false })
    .order('id',           { ascending: true })
    .limit(RADAR_FETCH_CAP)
  if (args.sourceId) itemsQuery = itemsQuery.eq('source_id', args.sourceId)

  const { data: itemsRaw, error: itemsErr } = await itemsQuery
  if (itemsErr) throw new Error(`radar_feed_items_failed: ${itemsErr.message}`)
  const items = itemsRaw ?? []

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

  const rows: RadarFeedRow[] = items.map((item) => {
    const score = scoresById.get(item.id) ?? null
    return {
      id:          item.id,
      sourceId:    item.source_id,
      sourceLabel: sourceLabelById.get(item.source_id) ?? 'Source inconnue',
      title:       item.title,
      url:         item.url,
      summary:     item.summary,
      publishedAt: item.published_at,
      createdAt:   item.created_at,
      decision:    item.decision,
      decisionAt:  item.decision_at,

      scoreStatus:       score?.status            ?? null,
      composite:         score?.composite         ?? null,
      memePotential:     score?.meme_potential    ?? null,
      yugnatFit:         score?.yugnat_fit        ?? null,
      timingUrgency:     score?.timing_urgency    ?? null,
      visualPotential:   score?.visual_potential  ?? null,
      culturalRelevance: score?.cultural_relevance ?? null,

      whyMemable:         score?.why_memable         ?? null,
      memeAngles:         parseMemeAngles(score?.meme_angles ?? null),
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
    }
  })

  // Final ordering happens in JS so `composite NULLS LAST` is honoured even
  // when `published_at` desc would surface unscored items first.
  rows.sort((a, b) => {
    const c = compareDesc(a.composite, b.composite)
    if (c !== 0) return c
    const p = compareIsoDesc(a.publishedAt, b.publishedAt)
    if (p !== 0) return p
    return compareIsoDesc(a.createdAt, b.createdAt)
  })

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

  return { items: display, kpis, sources: sourceOptions }
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
