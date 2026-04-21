import type { TUmamiEvent, TUmamiFetchParams } from '@creator-hub/types'

export type UmamiClientConfig = {
  apiUrl:    string
  apiKey:    string
  websiteId: string
}

type UmamiEventsApiRow = {
  id?:              string
  eventId?:         string
  websiteId?:       string
  sessionId?:       string | null
  createdAt?:       string
  timestamp?:       string | number
  urlPath?:         string
  url?:             string
  urlQuery?:        string | null
  referrerDomain?:  string | null
  referrerPath?:    string | null
  referrer?:        string | null
  eventName?:       string | null
}

type UmamiEventsApiResponse = {
  data?:  UmamiEventsApiRow[]
  count?: number
}

function normalizeRow(row: UmamiEventsApiRow, websiteId: string): TUmamiEvent {
  const createdAt =
    typeof row.createdAt === 'string'
      ? row.createdAt
      : typeof row.timestamp === 'number'
        ? new Date(row.timestamp).toISOString()
        : typeof row.timestamp === 'string'
          ? row.timestamp
          : new Date().toISOString()

  return {
    id:             row.id ?? row.eventId ?? `${websiteId}-${createdAt}`,
    websiteId:      row.websiteId ?? websiteId,
    sessionId:      row.sessionId ?? null,
    createdAt,
    urlPath:        row.urlPath ?? row.url ?? '',
    urlQuery:       row.urlQuery ?? null,
    referrerDomain: row.referrerDomain ?? null,
    referrerPath:   row.referrerPath ?? (row.referrer ?? null),
    eventName:      row.eventName ?? null,
  }
}

export async function fetchEvents(
  config: UmamiClientConfig,
  params: TUmamiFetchParams,
): Promise<TUmamiEvent[]> {
  const url = new URL(
    `/api/websites/${encodeURIComponent(config.websiteId)}/events`,
    config.apiUrl,
  )
  url.searchParams.set('startAt', String(params.startAt))
  url.searchParams.set('endAt',   String(params.endAt))
  if (params.limit) url.searchParams.set('limit', String(params.limit))

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept':        'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Umami fetchEvents ${res.status}: ${body.slice(0, 200)}`)
  }

  const payload = (await res.json()) as UmamiEventsApiResponse | UmamiEventsApiRow[]
  const rows = Array.isArray(payload) ? payload : (payload.data ?? [])
  return rows.map((row) => normalizeRow(row, config.websiteId))
}

export function umamiConfigFromEnv(): UmamiClientConfig | null {
  const apiUrl    = process.env.UMAMI_API_URL
  const apiKey    = process.env.UMAMI_API_KEY
  const websiteId = process.env.UMAMI_WEBSITE_ID
  if (!apiUrl || !apiKey || !websiteId) return null
  return { apiUrl, apiKey, websiteId }
}
