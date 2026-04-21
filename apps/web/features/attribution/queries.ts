import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type {
  AttributionEvent,
  AttributionMatchType,
  AttributionRule,
  AttributionTargetType,
  TTrafficOverviewRow,
} from '@creator-hub/types'
import {
  daysAgoIso,
  extractUtmSource,
  isAttributionMatchType,
  isAttributionTargetType,
} from './utils'

type Supabase = SupabaseClient<Database>

type AttrRow = Database['public']['Tables']['attribution_events']['Row']
type RuleRow = Database['public']['Tables']['attribution_rules']['Row']

function mapRule(row: RuleRow): AttributionRule {
  return {
    id:         row.id,
    label:      row.label,
    matchType:  isAttributionMatchType(row.match_type)   ? (row.match_type as AttributionMatchType)  : 'url_pattern',
    pattern:    row.pattern,
    targetType: isAttributionTargetType(row.target_type) ? (row.target_type as AttributionTargetType) : 'opportunity',
    targetId:   row.target_id,
    priority:   row.priority,
    active:     row.active,
    createdAt:  row.created_at,
  }
}

function mapEvent(row: AttrRow): AttributionEvent {
  return {
    id:            row.id,
    rawEventId:    row.raw_event_id,
    ruleId:        row.rule_id,
    opportunityId: row.opportunity_id,
    brandId:       row.brand_id,
    assetId:       row.asset_id,
    matchedBy:     isAttributionMatchType(row.matched_by) ? (row.matched_by as AttributionMatchType) : 'url_pattern',
    url:           row.url,
    referrer:      row.referrer,
    eventName:     row.event_name,
    occurredAt:    row.occurred_at,
  }
}

export async function listRules(supabase: Supabase): Promise<AttributionRule[]> {
  const { data } = await supabase
    .from('attribution_rules')
    .select('*')
    .order('active', { ascending: false })
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
  return (data ?? []).map(mapRule)
}

export type TrafficOverviewSummary = {
  totalClicks:        number
  attributedClicks:   number
  unattributedClicks: number
  byReferrer:         TTrafficOverviewRow[]
  byUrl:              TTrafficOverviewRow[]
  byUtmSource:        TTrafficOverviewRow[]
}

export async function getTrafficOverview(
  supabase: Supabase,
  days: number,
): Promise<TrafficOverviewSummary> {
  const since = daysAgoIso(days)

  const [rawRes, attrRes] = await Promise.all([
    supabase
      .from('raw_umami_events')
      .select('id, url, referrer, occurred_at')
      .gte('occurred_at', since),
    supabase
      .from('attribution_events')
      .select('raw_event_id')
      .gte('occurred_at', since),
  ])

  const raws = rawRes.data ?? []
  const attributedRawIds = new Set<string>((attrRes.data ?? []).map((r) => r.raw_event_id))

  const totalClicks        = raws.length
  const attributedClicks   = raws.filter((r) => attributedRawIds.has(r.id)).length
  const unattributedClicks = totalClicks - attributedClicks

  type Bucket = { clicks: number; attributed: number; sampleUrl: string | null }
  const byReferrer  = new Map<string, Bucket>()
  const byUrl       = new Map<string, Bucket>()
  const byUtm       = new Map<string, Bucket>()

  const push = (map: Map<string, Bucket>, key: string, attributed: boolean, url: string | null) => {
    const b = map.get(key) ?? { clicks: 0, attributed: 0, sampleUrl: null }
    b.clicks += 1
    if (attributed) b.attributed += 1
    if (!b.sampleUrl) b.sampleUrl = url
    map.set(key, b)
  }

  for (const r of raws) {
    const attributed = attributedRawIds.has(r.id)
    const url = r.url ?? ''
    const referrerKey = (r.referrer ?? '').trim() || '(direct)'
    const urlKey = url.split('?')[0] || '(empty)'
    const utm = extractUtmSource(url)

    push(byReferrer, referrerKey, attributed, url)
    push(byUrl, urlKey, attributed, url)
    if (utm) push(byUtm, utm, attributed, url)
  }

  const toRows = (
    map: Map<string, Bucket>,
    kind: TTrafficOverviewRow['kind'],
  ): TTrafficOverviewRow[] =>
    Array.from(map.entries())
      .map(([key, b]): TTrafficOverviewRow => ({
        key,
        kind,
        clicks:           b.clicks,
        attributedClicks: b.attributed,
        sampleUrl:        b.sampleUrl,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 15)

  return {
    totalClicks,
    attributedClicks,
    unattributedClicks,
    byReferrer:  toRows(byReferrer,  'referrer'),
    byUrl:       toRows(byUrl,       'url'),
    byUtmSource: toRows(byUtm,       'utm_source'),
  }
}

export async function listAttributionFor(
  supabase: Supabase,
  target: { opportunityId?: string; brandId?: string; assetId?: string },
  days: number,
  limit = 50,
): Promise<AttributionEvent[]> {
  let q = supabase
    .from('attribution_events')
    .select('*')
    .gte('occurred_at', daysAgoIso(days))
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (target.opportunityId) q = q.eq('opportunity_id', target.opportunityId)
  if (target.brandId)       q = q.eq('brand_id',       target.brandId)
  if (target.assetId)       q = q.eq('asset_id',       target.assetId)

  const { data } = await q
  return (data ?? []).map(mapEvent)
}

export type AttributionStats = {
  totalClicks:      number
  uniqueReferrers:  number
  topReferrer:      { key: string; clicks: number } | null
  lastClickAt:      string | null
}

export async function getAttributionStatsFor(
  supabase: Supabase,
  target: { opportunityId?: string; brandId?: string; assetId?: string },
  days: number,
): Promise<AttributionStats> {
  const events = await listAttributionFor(supabase, target, days, 500)

  const counts = new Map<string, number>()
  let lastClickAt: string | null = null
  for (const ev of events) {
    const key = (ev.referrer ?? '').trim() || '(direct)'
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (!lastClickAt || ev.occurredAt > lastClickAt) lastClickAt = ev.occurredAt
  }

  let topReferrer: AttributionStats['topReferrer'] = null
  for (const [key, clicks] of counts) {
    if (!topReferrer || clicks > topReferrer.clicks) topReferrer = { key, clicks }
  }

  return {
    totalClicks:     events.length,
    uniqueReferrers: counts.size,
    topReferrer,
    lastClickAt,
  }
}

export async function listOpportunityOptions(
  supabase: Supabase,
): Promise<Array<{ id: string; name: string }>> {
  const { data } = await supabase
    .from('opportunities')
    .select('id, name')
    .order('name', { ascending: true })
  return data ?? []
}

export async function listBrandOptions(
  supabase: Supabase,
): Promise<Array<{ id: string; name: string }>> {
  const { data } = await supabase
    .from('brands')
    .select('id, name')
    .order('name', { ascending: true })
  return data ?? []
}

export async function listAssetOptions(
  supabase: Supabase,
): Promise<Array<{ id: string; name: string }>> {
  const { data } = await supabase
    .from('assets')
    .select('id, name')
    .order('name', { ascending: true })
  return data ?? []
}

export async function resolveTargetName(
  supabase: Supabase,
  targetType: AttributionTargetType,
  targetId: string,
): Promise<string | null> {
  const table = targetType === 'opportunity' ? 'opportunities' : targetType === 'brand' ? 'brands' : 'assets'
  const nameCol = 'name'
  const { data } = await supabase
    .from(table)
    .select(nameCol)
    .eq('id', targetId)
    .maybeSingle<Record<string, string>>()
  return data ? (data[nameCol] ?? null) : null
}
