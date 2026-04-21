import type {
  BrandWatchlist,
  ReviewQueueRow,
  WatchlistEvent,
} from '@creator-hub/types'

export const REVIEW_WINDOW_OPTIONS = [7, 14, 30] as const
export type ReviewWindowDays = (typeof REVIEW_WINDOW_OPTIONS)[number]

export function parseWindow(value: string | undefined): ReviewWindowDays {
  const n = Number(value)
  return (REVIEW_WINDOW_OPTIONS as readonly number[]).includes(n)
    ? (n as ReviewWindowDays)
    : 14
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

/**
 * Normalize a URL so webhook events can match watchlist entries without
 * being tripped up by trailing slashes, hash fragments, case, or www.
 * Query string is preserved (utm_* matter for changedetection routing).
 */
export function normalizeUrl(value: string | null | undefined): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    const host = parsed.host.toLowerCase().replace(/^www\./, '')
    const path = parsed.pathname.replace(/\/+$/, '') || '/'
    const search = parsed.search ?? ''
    return `${parsed.protocol}//${host}${path}${search}`
  } catch {
    return trimmed.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase()
  }
}

export function urlHost(url: string | null | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

/**
 * Canonical task label for a review-queue event-to-task conversion.
 * Kept in one place so the dedup check and the insert agree on the exact
 * string — any divergence would silently defeat idempotency.
 */
export function watchTaskLabel(brandName: string, labelOrUrl: string): string {
  return `Relance veille · ${brandName} · ${labelOrUrl}`
}

type WatchlistLike = Pick<BrandWatchlist, 'id' | 'brandId' | 'url' | 'label' | 'active'>

/**
 * Pure classification: given an event + the full set of active watchlists,
 * return the review-queue bucket. Multi-match is NEVER auto-resolved — ties
 * are surfaced to the UI as ambiguous with every candidate listed.
 */
export function classifyEvent(
  event: WatchlistEvent,
  activeWatchlists: WatchlistLike[],
  brandNameById: Map<string, string>,
): ReviewQueueRow {
  const key = normalizeUrl(event.url)
  const candidates = activeWatchlists.filter((w) => normalizeUrl(w.url) === key)

  const mapped = candidates.map((w) => ({
    watchlistId: w.id,
    brandId:     w.brandId,
    brandName:   brandNameById.get(w.brandId) ?? '—',
    label:       w.label,
  }))

  if (mapped.length === 0) return { event, status: 'unmatched', candidates: [] }
  if (mapped.length === 1) return { event, status: 'matched',   candidates: mapped }
  return { event, status: 'ambiguous', candidates: mapped }
}
