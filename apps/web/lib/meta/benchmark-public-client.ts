// Benchmark public client — official Meta Graph API only.
//
// PR 2: read-only probe surface. No DB writes happen here. Two
// endpoints are covered:
//
//   1. Business Discovery — query an external public Instagram
//      Business / Creator account through the operator's own
//      ig-user-id. Officially supported, no scraping.
//   2. oEmbed — fallback for permalink/author confirmation only,
//      using the official `/instagram_oembed` endpoint.
//
// Errors are returned as a structured shape (`BenchmarkApiError`)
// so the probe layer can classify each failure into the
// `benchmark_metric_status` enum (unavailable_400 / 403 / other).
// We never throw on HTTP errors — callers always see status +
// body and decide.

import { GRAPH_BASE } from './instagram-client'

// Subset of fields the probe asks for from a media item via
// Business Discovery. `view_count` is best-effort (some media
// types don't expose it). `reposts` candidates are tried later
// in the probe layer because the API may reject unknown fields
// and there's no single canonical name.
const MEDIA_DISCOVERY_FIELDS = [
  'id',
  'media_type',
  'permalink',
  'timestamp',
  'like_count',
  'comments_count',
  'view_count',
] as const

const ACCOUNT_DISCOVERY_FIELDS = [
  'username',
  'id',
  'followers_count',
  'media_count',
] as const

export type BenchmarkApiError = {
  status:  number
  body:    unknown
  message: string
}

export type BenchmarkApiResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: BenchmarkApiError }

export type BusinessDiscoveryMedia = {
  id:             string
  media_type?:    string
  permalink?:     string
  timestamp?:     string
  like_count?:    number
  comments_count?: number
  view_count?:    number
  // Reposts: probed separately via probeMediaField().
  [k: string]:    unknown
}

export type BusinessDiscoveryAccount = {
  username:        string
  id:              string
  followers_count?: number
  media_count?:    number
  media?: {
    data:   BusinessDiscoveryMedia[]
    paging?: { cursors?: { after?: string }; next?: string }
  }
}

export type BusinessDiscoveryEnvelope = {
  business_discovery?: BusinessDiscoveryAccount
  id?: string
}

async function graphGetRaw(
  url: URL
): Promise<BenchmarkApiResult<unknown>> {
  let res: Response
  try {
    res = await fetch(url.toString(), { cache: 'no-store' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { status: 0, body: null, message } }
  }

  const text = await res.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // Leave body as raw text; callers can still inspect it.
  }

  if (!res.ok) {
    return {
      ok: false,
      error: {
        status:  res.status,
        body,
        message: `Meta Graph ${res.status}`,
      },
    }
  }

  return { ok: true, data: body }
}

/**
 * Business Discovery — fetch an external public IG Business /
 * Creator account through the operator's own ig-user-id node.
 *
 * Officially supported by the Instagram Graph API. Requires that
 * BOTH the operator account and the target account are Business
 * or Creator accounts; otherwise the API returns a 400 with a
 * specific error subcode.
 */
export async function fetchBusinessDiscovery(args: {
  igUserId:        string
  targetUsername:  string
  accessToken:     string
  mediaLimit?:     number
  mediaFieldsExtra?: readonly string[]
}): Promise<BenchmarkApiResult<BusinessDiscoveryEnvelope>> {
  const mediaLimit = args.mediaLimit ?? 5
  const mediaFields = [
    ...MEDIA_DISCOVERY_FIELDS,
    ...(args.mediaFieldsExtra ?? []),
  ].join(',')

  const fields =
    `business_discovery.username(${args.targetUsername}){` +
    `${ACCOUNT_DISCOVERY_FIELDS.join(',')},` +
    `media.limit(${mediaLimit}){${mediaFields}}` +
    `}`

  const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(args.igUserId)}`)
  url.searchParams.set('fields', fields)
  url.searchParams.set('access_token', args.accessToken)

  const res = await graphGetRaw(url)
  if (!res.ok) return res
  return { ok: true, data: res.data as BusinessDiscoveryEnvelope }
}

/**
 * Probe a single field name on Business Discovery for one media
 * item. Used to ask "does the API expose `reshare_count` for
 * this account?" without poisoning the main fields call.
 *
 * Returns the raw envelope so the probe layer can decide whether
 * the field came back populated, missing, or rejected.
 */
export async function probeMediaField(args: {
  igUserId:       string
  targetUsername: string
  accessToken:    string
  fieldName:      string
}): Promise<BenchmarkApiResult<BusinessDiscoveryEnvelope>> {
  return fetchBusinessDiscovery({
    igUserId:         args.igUserId,
    targetUsername:   args.targetUsername,
    accessToken:      args.accessToken,
    mediaLimit:       1,
    mediaFieldsExtra: [args.fieldName],
  })
}

/**
 * Official oEmbed fallback. Used only to confirm permalink /
 * author info; never to extract metrics.
 */
export async function fetchOEmbed(args: {
  permalink:    string
  accessToken:  string
}): Promise<BenchmarkApiResult<unknown>> {
  const url = new URL(`${GRAPH_BASE}/instagram_oembed`)
  url.searchParams.set('url', args.permalink)
  url.searchParams.set('access_token', args.accessToken)
  return graphGetRaw(url)
}
