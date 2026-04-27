import type {
  IGAccountFields,
  IGMediaFields,
  IGInsightsResponse,
  IGFollowerDemographicsResponse,
  TAudienceDemographicBreakdown,
  TAudienceDemographicsTimeframe,
} from '@creator-hub/types'

export const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

// `impressions` was deprecated for Instagram media insights in Graph API v21
// (removed for organic media posted after 2024-07-02). Including it in the
// comma-joined metric list causes the whole /{media-id}/insights call to 400.
const MEDIA_INSIGHTS_METRICS = [
  'reach',
  'saved',
  'shares',
  'comments',
  'likes',
  'profile_visits',
] as const

async function graphGet<T>(
  path: string,
  params: Record<string, string>,
  accessToken: string
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`)
  url.searchParams.set('access_token', accessToken)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Meta API ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

export async function fetchAccount(
  igUserId: string,
  accessToken: string
): Promise<IGAccountFields> {
  return graphGet<IGAccountFields>(
    `/${igUserId}`,
    { fields: 'id,username,biography,followers_count,media_count,profile_picture_url' },
    accessToken
  )
}

export async function fetchMediaPage(
  igUserId: string,
  accessToken: string,
  after?: string
): Promise<{ data: IGMediaFields[]; paging?: { cursors?: { after?: string }; next?: string } }> {
  const params: Record<string, string> = {
    fields: 'id,media_type,caption,permalink,timestamp,thumbnail_url,media_url',
    limit: '50',
  }
  if (after) params['after'] = after

  return graphGet(
    `/${igUserId}/media`,
    params,
    accessToken
  )
}

export async function fetchAllMedia(
  igUserId: string,
  accessToken: string,
  limit?: number
): Promise<IGMediaFields[]> {
  const allMedia: IGMediaFields[] = []
  let after: string | undefined

  do {
    const page = await fetchMediaPage(igUserId, accessToken, after)
    allMedia.push(...page.data)
    if (limit !== undefined && allMedia.length >= limit) break
    after = page.paging?.cursors?.after
    if (!page.paging?.next) break
  } while (after)

  return limit !== undefined ? allMedia.slice(0, limit) : allMedia
}

export async function fetchMediaInsights(
  mediaId: string,
  mediaType: string,
  accessToken: string
): Promise<IGInsightsResponse> {
  if (mediaType === 'STORY') {
    return graphGet<IGInsightsResponse>(
      `/${mediaId}/insights`,
      { metric: ['reach', 'impressions', 'replies'].join(','), period: 'lifetime' },
      accessToken
    )
  }

  try {
    return await graphGet<IGInsightsResponse>(
      `/${mediaId}/insights`,
      { metric: MEDIA_INSIGHTS_METRICS.join(','), period: 'lifetime' },
      accessToken
    )
  } catch (err) {
    // VIDEO media rejects `profile_visits` with a 400, which poisons the whole
    // metric request. Retry once without it so we still capture the supported
    // metrics (reach/saved/shares/likes/comments).
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('Meta API 400') && message.includes('profile_visits')) {
      const fallback = MEDIA_INSIGHTS_METRICS.filter((m) => m !== 'profile_visits')
      return graphGet<IGInsightsResponse>(
        `/${mediaId}/insights`,
        { metric: fallback.join(','), period: 'lifetime' },
        accessToken
      )
    }
    throw err
  }
}

// Outcome for one breakdown of a follower_demographics call.
// `available` carries the parsed (key, value) pairs; the two
// other states carry a human reason string that the UI surfaces
// verbatim. Network/runtime errors are not represented here —
// they propagate up so runFullSync's try/catch can record them
// in `result.errors`.
export type FetchFollowerDemographicsOutcome =
  | { status: 'available';                 rows: Array<{ key: string; value: number }>; raw: unknown }
  | { status: 'available_below_threshold'; reason: string;                               raw: unknown }
  | { status: 'unavailable';               reason: string;                               raw: unknown }

// 4xx error fingerprints we treat as "Meta refuses to serve this
// metric for the current token / account". Most commonly: missing
// `instagram_manage_insights` permission.
function classifyMeta4xx(message: string): { isPermission: boolean; trimmed: string } {
  const isPermission =
    /instagram_manage_insights/i.test(message) ||
    /\(#10\)/.test(message) ||
    /OAuthException/i.test(message) ||
    /permission/i.test(message)
  // Truncate very long Meta error bodies so the UI doesn't render
  // a paragraph of JSON.
  const trimmed = message.length > 240 ? `${message.slice(0, 240)}…` : message
  return { isPermission, trimmed }
}

export async function fetchFollowerDemographics(args: {
  igUserId:    string
  accessToken: string
  breakdown:   TAudienceDemographicBreakdown
  timeframe:   TAudienceDemographicsTimeframe
}): Promise<FetchFollowerDemographicsOutcome> {
  const { igUserId, accessToken, breakdown, timeframe } = args

  let response: IGFollowerDemographicsResponse
  try {
    response = await graphGet<IGFollowerDemographicsResponse>(
      `/${igUserId}/insights`,
      {
        metric:      'follower_demographics',
        period:      'lifetime',
        metric_type: 'total_value',
        timeframe,
        breakdown,
      },
      accessToken
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Only classify documented 4xx shapes as `unavailable`. Other
    // errors (network, 5xx) propagate to the caller.
    if (message.includes('Meta API 4')) {
      const { isPermission, trimmed } = classifyMeta4xx(message)
      const reason = isPermission
        ? `Indisponible côté Meta — likely missing instagram_manage_insights permission. ${trimmed}`
        : `Indisponible côté Meta — ${trimmed}`
      return { status: 'unavailable', reason, raw: { error: message } }
    }
    throw err
  }

  const datum    = response.data?.[0]
  const breakdowns = datum?.total_value?.breakdowns ?? []
  const rawRows = breakdowns[0]?.results ?? []

  if (rawRows.length === 0) {
    return {
      status: 'available_below_threshold',
      reason: 'Sous le seuil Meta (~100 followers) pour cet axe — aucune répartition publiée.',
      raw:    response,
    }
  }

  const rows: Array<{ key: string; value: number }> = []
  for (const r of rawRows) {
    const key = r.dimension_values?.[0]
    const v   = r.value
    if (typeof key !== 'string' || typeof v !== 'number') continue
    rows.push({ key, value: v })
  }

  if (rows.length === 0) {
    return {
      status: 'available_below_threshold',
      reason: 'Réponse Meta sans valeur exploitable pour cet axe.',
      raw:    response,
    }
  }

  return { status: 'available', rows, raw: response }
}
