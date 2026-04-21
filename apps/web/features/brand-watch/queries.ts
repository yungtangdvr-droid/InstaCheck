import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type {
  BrandWatchlist,
  ReviewQueueRow,
  WatchlistEvent,
  WatchlistListRow,
} from '@creator-hub/types'
import { classifyEvent, daysAgoIso, normalizeUrl } from './utils'

type Supabase       = SupabaseClient<Database>
type WatchRow       = Database['public']['Tables']['brand_watchlists']['Row']
type RawEventRow    = Database['public']['Tables']['raw_watchlist_events']['Row']

function mapWatchlist(row: WatchRow): BrandWatchlist {
  return {
    id:           row.id,
    brandId:      row.brand_id ?? '',
    url:          row.url,
    label:        row.label,
    lastChangeAt: row.last_change_at,
    active:       row.active,
  }
}

function mapEvent(row: RawEventRow): WatchlistEvent {
  return {
    id:            row.id,
    url:           row.url,
    changeSummary: row.change_summary,
    detectedAt:    row.detected_at,
  }
}

async function fetchBrandNames(
  supabase: Supabase,
  brandIds: string[],
): Promise<Map<string, string>> {
  if (brandIds.length === 0) return new Map()
  const { data } = await supabase
    .from('brands')
    .select('id, name')
    .in('id', brandIds)
  const map = new Map<string, string>()
  for (const b of data ?? []) map.set(b.id, b.name)
  return map
}

export async function listWatchlists(
  supabase: Supabase,
  filter?: { brandId?: string; activeOnly?: boolean },
): Promise<BrandWatchlist[]> {
  let q = supabase.from('brand_watchlists').select('*')
  if (filter?.brandId)    q = q.eq('brand_id', filter.brandId)
  if (filter?.activeOnly) q = q.eq('active', true)
  const { data } = await q.order('active', { ascending: false })
    .order('last_change_at', { ascending: false, nullsFirst: false })
  return (data ?? []).map(mapWatchlist)
}

/**
 * Enriched watchlist rows for the management table: brand name + recent event
 * counts in the review window.
 */
export async function listWatchlistRows(
  supabase: Supabase,
  windowDays: number,
): Promise<WatchlistListRow[]> {
  const watchlists = await listWatchlists(supabase)
  if (watchlists.length === 0) return []

  const brandIds    = Array.from(new Set(watchlists.map((w) => w.brandId).filter(Boolean)))
  const brandNames  = await fetchBrandNames(supabase, brandIds)

  const { data: events } = await supabase
    .from('raw_watchlist_events')
    .select('url, detected_at')
    .gte('detected_at', daysAgoIso(windowDays))

  const countByKey   = new Map<string, number>()
  const lastByKey    = new Map<string, string>()
  for (const ev of events ?? []) {
    const key = normalizeUrl(ev.url)
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1)
    const prev = lastByKey.get(key)
    if (!prev || ev.detected_at > prev) lastByKey.set(key, ev.detected_at)
  }

  return watchlists.map((w) => {
    const key = normalizeUrl(w.url)
    return {
      ...w,
      brandName:   brandNames.get(w.brandId) ?? '—',
      eventsCount: countByKey.get(key) ?? 0,
      lastEventAt: lastByKey.get(key) ?? null,
    }
  })
}

export async function getWatchlist(
  supabase: Supabase,
  id: string,
): Promise<BrandWatchlist | null> {
  const { data } = await supabase
    .from('brand_watchlists')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return data ? mapWatchlist(data) : null
}

export type BrandWatchSummary = {
  activeWatches:   number
  totalEvents:     number
  matchedEvents:   number
  ambiguousEvents: number
  unmatchedEvents: number
  windowDays:      number
}

/**
 * Build the review queue. Multi-match is never collapsed: an event is
 * classified as ambiguous with all candidate brands listed, so the user
 * can resolve the conflict (deactivate or delete one of the watchlists)
 * before any task is created.
 */
export async function buildReviewQueue(
  supabase: Supabase,
  windowDays: number,
): Promise<{ rows: ReviewQueueRow[]; summary: BrandWatchSummary }> {
  const since = daysAgoIso(windowDays)

  const [{ data: rawEvents }, { data: watchRows }] = await Promise.all([
    supabase
      .from('raw_watchlist_events')
      .select('*')
      .gte('detected_at', since)
      .order('detected_at', { ascending: false })
      .limit(500),
    supabase
      .from('brand_watchlists')
      .select('*')
      .eq('active', true),
  ])

  const activeWatchlists = (watchRows ?? []).map(mapWatchlist)
  const events           = (rawEvents ?? []).map(mapEvent)

  const brandIds    = Array.from(new Set(activeWatchlists.map((w) => w.brandId).filter(Boolean)))
  const brandNames  = await fetchBrandNames(supabase, brandIds)

  const rows = events.map((e) => classifyEvent(e, activeWatchlists, brandNames))

  let matchedEvents = 0, ambiguousEvents = 0, unmatchedEvents = 0
  for (const r of rows) {
    if (r.status === 'matched')        matchedEvents   += 1
    else if (r.status === 'ambiguous') ambiguousEvents += 1
    else                                unmatchedEvents += 1
  }

  return {
    rows,
    summary: {
      activeWatches:   activeWatchlists.length,
      totalEvents:     events.length,
      matchedEvents,
      ambiguousEvents,
      unmatchedEvents,
      windowDays,
    },
  }
}

/**
 * Preview the 5 most recent matched events for a single brand, used by the
 * CRM brand page. Ambiguous / unmatched events are intentionally excluded
 * from the per-brand preview — they belong in the global review queue.
 */
export async function listRecentEventsForBrand(
  supabase: Supabase,
  brandId: string,
  windowDays = 14,
  limit = 5,
): Promise<WatchlistEvent[]> {
  const watchlists = await listWatchlists(supabase, { brandId, activeOnly: true })
  if (watchlists.length === 0) return []

  const { data } = await supabase
    .from('raw_watchlist_events')
    .select('*')
    .gte('detected_at', daysAgoIso(windowDays))
    .order('detected_at', { ascending: false })
    .limit(200)

  const keys = new Set(watchlists.map((w) => normalizeUrl(w.url)))
  return (data ?? [])
    .filter((r) => keys.has(normalizeUrl(r.url)))
    .slice(0, limit)
    .map(mapEvent)
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
