import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type {
  Asset,
  AssetEvent,
  AssetListRow,
  AssetType,
  Opportunity,
  TRelanceStatus,
} from '@creator-hub/types'
import { isAssetEventType, isAssetType } from './utils'
import { isDealStage } from '@/features/deals/utils'

type Supabase = SupabaseClient<Database>

function mapAsset(row: Database['public']['Tables']['assets']['Row']): Asset {
  return {
    id:               row.id,
    name:             row.name,
    type:             isAssetType(row.type) ? row.type : 'creator_deck',
    papermarkLinkId:  row.papermark_link_id ?? undefined,
    papermarkLinkUrl: row.papermark_link_url ?? undefined,
    createdAt:        row.created_at,
  }
}

function mapAssetEvent(
  row: Database['public']['Tables']['asset_events']['Row'],
): AssetEvent {
  return {
    id:                row.id,
    assetId:           row.asset_id,
    eventType:         isAssetEventType(row.event_type) ? row.event_type : 'opened',
    viewerFingerprint: row.viewer_fingerprint,
    durationMs:        row.duration_ms,
    occurredAt:        row.occurred_at,
  }
}

export async function listAssets(supabase: Supabase): Promise<AssetListRow[]> {
  const { data: assets } = await supabase
    .from('assets')
    .select('*')
    .order('created_at', { ascending: false })

  if (!assets || assets.length === 0) return []

  const ids = assets.map((a) => a.id)

  const [eventsRes, oppsRes] = await Promise.all([
    supabase
      .from('asset_events')
      .select('asset_id, event_type, occurred_at')
      .in('asset_id', ids),
    supabase
      .from('opportunities')
      .select('deck_id')
      .in('deck_id', ids),
  ])

  const eventsCount = new Map<string, number>()
  const openedCount = new Map<string, number>()
  const lastEvent   = new Map<string, string>()
  const linkedOpps  = new Map<string, number>()

  for (const ev of eventsRes.data ?? []) {
    eventsCount.set(ev.asset_id, (eventsCount.get(ev.asset_id) ?? 0) + 1)
    if (ev.event_type === 'opened') {
      openedCount.set(ev.asset_id, (openedCount.get(ev.asset_id) ?? 0) + 1)
    }
    const prev = lastEvent.get(ev.asset_id)
    if (!prev || ev.occurred_at > prev) lastEvent.set(ev.asset_id, ev.occurred_at)
  }

  for (const o of oppsRes.data ?? []) {
    if (!o.deck_id) continue
    linkedOpps.set(o.deck_id, (linkedOpps.get(o.deck_id) ?? 0) + 1)
  }

  return assets.map((row) => {
    const asset = mapAsset(row)
    return {
      ...asset,
      eventsCount:              eventsCount.get(asset.id) ?? 0,
      openedCount:              openedCount.get(asset.id) ?? 0,
      lastEventAt:              lastEvent.get(asset.id) ?? null,
      linkedOpportunitiesCount: linkedOpps.get(asset.id) ?? 0,
    }
  })
}

export async function getAsset(supabase: Supabase, id: string): Promise<Asset | null> {
  const { data } = await supabase.from('assets').select('*').eq('id', id).maybeSingle()
  return data ? mapAsset(data) : null
}

export async function listAssetEvents(
  supabase: Supabase,
  assetId: string,
): Promise<AssetEvent[]> {
  const { data } = await supabase
    .from('asset_events')
    .select('*')
    .eq('asset_id', assetId)
    .order('occurred_at', { ascending: false })
    .limit(200)
  return (data ?? []).map(mapAssetEvent)
}

export type LinkedOpportunityRow = Pick<
  Opportunity,
  'id' | 'name' | 'stage' | 'probability' | 'estimatedValue' | 'currency' | 'brandId'
> & { brandName: string | null }

export async function listLinkedOpportunities(
  supabase: Supabase,
  assetId: string,
): Promise<LinkedOpportunityRow[]> {
  const { data: opps } = await supabase
    .from('opportunities')
    .select('id, name, stage, probability, estimated_value, currency, brand_id')
    .eq('deck_id', assetId)
    .order('last_activity_at', { ascending: false, nullsFirst: false })

  if (!opps || opps.length === 0) return []

  const brandIds = Array.from(
    new Set(opps.map((o) => o.brand_id).filter((v): v is string => !!v)),
  )

  const brandsRes = brandIds.length
    ? await supabase.from('brands').select('id, name').in('id', brandIds)
    : { data: [] as { id: string; name: string }[] }

  const brandNames = new Map<string, string>()
  for (const b of brandsRes.data ?? []) brandNames.set(b.id, b.name)

  return opps.map((o) => ({
    id:             o.id,
    name:           o.name,
    stage:          isDealStage(o.stage) ? o.stage : 'target_identified',
    probability:    o.probability,
    estimatedValue: o.estimated_value ?? undefined,
    currency:       o.currency,
    brandId:        o.brand_id ?? undefined,
    brandName:      o.brand_id ? brandNames.get(o.brand_id) ?? null : null,
  }))
}

export async function listAssetOptions(
  supabase: Supabase,
): Promise<Array<{ id: string; name: string; type: AssetType }>> {
  const { data } = await supabase
    .from('assets')
    .select('id, name, type')
    .order('created_at', { ascending: false })

  return (data ?? []).map((row) => ({
    id:   row.id,
    name: row.name,
    type: isAssetType(row.type) ? row.type : 'creator_deck',
  }))
}

export async function getRelanceStatus(
  supabase: Supabase,
  assetId: string,
): Promise<TRelanceStatus> {
  const [eventsRes, oppsRes] = await Promise.all([
    supabase
      .from('asset_events')
      .select('event_type, occurred_at')
      .eq('asset_id', assetId)
      .order('occurred_at', { ascending: false }),
    supabase.from('opportunities').select('id').eq('deck_id', assetId),
  ])

  let openedCount    = 0
  let completedCount = 0
  let lastEventAt: string | null = null

  for (const ev of eventsRes.data ?? []) {
    if (!lastEventAt) lastEventAt = ev.occurred_at
    if (ev.event_type === 'opened')    openedCount++
    if (ev.event_type === 'completed') completedCount++
  }

  const oppIds = (oppsRes.data ?? []).map((o) => o.id)
  if (oppIds.length === 0) {
    return {
      openedCount,
      completedCount,
      lastEventAt,
      relanceTaskId: null,
      relanceDueAt:  null,
      relanceDone:   false,
    }
  }

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, status, due_at, created_at')
    .in('linked_opportunity_id', oppIds)
    .ilike('label', 'Relancer suite%')
    .order('created_at', { ascending: false })
    .limit(1)

  const task = tasks?.[0] ?? null

  return {
    openedCount,
    completedCount,
    lastEventAt,
    relanceTaskId: task?.id ?? null,
    relanceDueAt:  task?.due_at ?? null,
    relanceDone:   task ? task.status === 'done' : false,
  }
}
