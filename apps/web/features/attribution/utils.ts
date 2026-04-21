import type {
  AttributionMatchType,
  AttributionTargetType,
} from '@creator-hub/types'

export const ATTRIBUTION_MATCH_TYPES: AttributionMatchType[] = [
  'url_pattern',
  'utm_source',
  'referrer',
  'asset_link_url',
]

export const ATTRIBUTION_MATCH_TYPE_LABEL: Record<AttributionMatchType, string> = {
  url_pattern:    'URL (substring)',
  utm_source:     'utm_source',
  referrer:       'Referrer',
  asset_link_url: 'Asset link (auto)',
}

export const ATTRIBUTION_TARGET_TYPES: AttributionTargetType[] = [
  'opportunity',
  'brand',
  'asset',
]

export const ATTRIBUTION_TARGET_TYPE_LABEL: Record<AttributionTargetType, string> = {
  opportunity: 'Opportunité',
  brand:       'Brand',
  asset:       'Asset',
}

export const ATTRIBUTION_MATCH_BADGE: Record<AttributionMatchType, string> = {
  url_pattern:    'bg-sky-500/15 text-sky-300',
  utm_source:     'bg-amber-500/15 text-amber-300',
  referrer:       'bg-violet-500/15 text-violet-300',
  asset_link_url: 'bg-emerald-500/15 text-emerald-300',
}

export function isAttributionMatchType(v: string | null | undefined): v is AttributionMatchType {
  return ATTRIBUTION_MATCH_TYPES.includes(v as AttributionMatchType)
}

export function isAttributionTargetType(v: string | null | undefined): v is AttributionTargetType {
  return ATTRIBUTION_TARGET_TYPES.includes(v as AttributionTargetType)
}

export function normalizeUrl(value: string | null | undefined): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    const host = parsed.host.toLowerCase()
    const path = parsed.pathname.replace(/\/+$/, '') || '/'
    const search = parsed.search ?? ''
    return `${parsed.protocol}//${host}${path}${search}`
  } catch {
    return trimmed
      .replace(/#.*$/, '')
      .replace(/\/+$/, '')
      .toLowerCase()
  }
}

export function extractUtmSource(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get('utm_source')
  } catch {
    const match = url.match(/[?&]utm_source=([^&#]+)/i)
    return match ? decodeURIComponent(match[1]) : null
  }
}

export type RawEventForMatching = {
  url:       string
  referrer:  string | null
}

export type RuleForMatching = {
  id:         string
  matchType:  AttributionMatchType
  pattern:    string
  targetType: AttributionTargetType
  targetId:   string
  priority:   number
}

export function ruleMatches(
  raw: RawEventForMatching,
  rule: RuleForMatching,
): boolean {
  const pattern = rule.pattern.trim()
  if (!pattern) return false

  switch (rule.matchType) {
    case 'url_pattern':
      return raw.url.toLowerCase().includes(pattern.toLowerCase())
    case 'referrer':
      return (raw.referrer ?? '').toLowerCase().includes(pattern.toLowerCase())
    case 'utm_source': {
      const utm = extractUtmSource(raw.url)
      return utm !== null && utm.toLowerCase() === pattern.toLowerCase()
    }
    case 'asset_link_url':
      return normalizeUrl(raw.url) === normalizeUrl(pattern)
    default:
      return false
  }
}

export function formatPeriodDays(days: number): string {
  return `${days}j`
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}
