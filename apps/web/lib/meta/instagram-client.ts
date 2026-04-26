import type {
  IGAccountFields,
  IGMediaFields,
  IGInsightsResponse,
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
