import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type {
  AttributionMatchType,
  AttributionTargetType,
} from '@creator-hub/types'
import {
  isAttributionMatchType,
  isAttributionTargetType,
  normalizeUrl,
  ruleMatches,
  type RawEventForMatching,
  type RuleForMatching,
} from '@/features/attribution/utils'

type Supabase = SupabaseClient<Database>

type RawRow = Database['public']['Tables']['raw_umami_events']['Row']
type AttrInsert = Database['public']['Tables']['attribution_events']['Insert']

const RESOLVE_LOOKBACK_DAYS = 7
const RESOLVE_LOOKBACK_MS = RESOLVE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000

export type ResolveAttributionOutcome = {
  resolved:  number
  ambiguous: number
}

export async function resolveAttribution(
  supabase: Supabase,
  now: Date = new Date(),
): Promise<ResolveAttributionOutcome> {
  const { data: latestResolved } = await supabase
    .from('attribution_events')
    .select('occurred_at')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ occurred_at: string }>()

  const sinceIso = latestResolved?.occurred_at
    ? new Date(new Date(latestResolved.occurred_at).getTime() - RESOLVE_LOOKBACK_MS).toISOString()
    : new Date(now.getTime() - RESOLVE_LOOKBACK_MS).toISOString()

  const { data: raws } = await supabase
    .from('raw_umami_events')
    .select('id, url, referrer, event_name, occurred_at')
    .gte('occurred_at', sinceIso)
    .order('occurred_at', { ascending: true })

  if (!raws || raws.length === 0) return { resolved: 0, ambiguous: 0 }

  const rawIds = raws.map((r) => r.id)

  const { data: existing } = await supabase
    .from('attribution_events')
    .select('raw_event_id')
    .in('raw_event_id', rawIds)

  const alreadyResolved = new Set<string>((existing ?? []).map((r) => r.raw_event_id))

  const { data: ruleRows } = await supabase
    .from('attribution_rules')
    .select('id, match_type, pattern, target_type, target_id, priority')
    .eq('active', true)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })

  const rules: RuleForMatching[] = (ruleRows ?? [])
    .filter(
      (r) => isAttributionMatchType(r.match_type) && isAttributionTargetType(r.target_type),
    )
    .map((r) => ({
      id:         r.id,
      matchType:  r.match_type as AttributionMatchType,
      pattern:    r.pattern,
      targetType: r.target_type as AttributionTargetType,
      targetId:   r.target_id,
      priority:   r.priority,
    }))

  const { data: assets } = await supabase
    .from('assets')
    .select('id, papermark_link_url')

  const assetByNormalizedUrl = new Map<string, string[]>()
  for (const a of assets ?? []) {
    const normalized = normalizeUrl(a.papermark_link_url)
    if (!normalized) continue
    const list = assetByNormalizedUrl.get(normalized) ?? []
    list.push(a.id)
    assetByNormalizedUrl.set(normalized, list)
  }

  const inserts: AttrInsert[] = []
  let ambiguous = 0

  for (const raw of raws as RawRow[]) {
    if (alreadyResolved.has(raw.id)) continue

    const rawMatching: RawEventForMatching = {
      url:      raw.url ?? '',
      referrer: raw.referrer,
    }

    // Single-winner: rules are pre-sorted priority DESC, created_at ASC.
    // First match wins; ties broken deterministically by order.
    let winner: RuleForMatching | null = null
    for (const rule of rules) {
      if (ruleMatches(rawMatching, rule)) {
        winner = rule
        break
      }
    }

    if (winner) {
      inserts.push(buildExplicitInsert(raw, winner))
      continue
    }

    // Implicit fallback: exact normalized URL equality against a single asset.
    const normalized = normalizeUrl(raw.url)
    if (!normalized) continue
    const candidates = assetByNormalizedUrl.get(normalized) ?? []
    if (candidates.length === 1) {
      inserts.push(buildImplicitInsert(raw, candidates[0]))
    } else if (candidates.length > 1) {
      ambiguous += 1
    }
  }

  if (inserts.length === 0) return { resolved: 0, ambiguous }

  const CHUNK = 500
  let resolved = 0
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const slice = inserts.slice(i, i + CHUNK)
    const { data } = await supabase
      .from('attribution_events')
      .upsert(slice, { onConflict: 'raw_event_id', ignoreDuplicates: true })
      .select('id')
    resolved += data?.length ?? 0
  }

  return { resolved, ambiguous }
}

function buildExplicitInsert(raw: RawRow, rule: RuleForMatching): AttrInsert {
  return {
    raw_event_id:   raw.id,
    rule_id:        rule.id,
    opportunity_id: rule.targetType === 'opportunity' ? rule.targetId : null,
    brand_id:       rule.targetType === 'brand'       ? rule.targetId : null,
    asset_id:       rule.targetType === 'asset'       ? rule.targetId : null,
    matched_by:     rule.matchType,
    url:            raw.url ?? '',
    referrer:       raw.referrer ?? null,
    event_name:     raw.event_name ?? null,
    occurred_at:    raw.occurred_at,
  }
}

function buildImplicitInsert(raw: RawRow, assetId: string): AttrInsert {
  return {
    raw_event_id:   raw.id,
    rule_id:        null,
    opportunity_id: null,
    brand_id:       null,
    asset_id:       assetId,
    matched_by:     'asset_link_url',
    url:            raw.url ?? '',
    referrer:       raw.referrer ?? null,
    event_name:     raw.event_name ?? null,
    occurred_at:    raw.occurred_at,
  }
}
