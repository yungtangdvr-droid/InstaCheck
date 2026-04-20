import type {
  IGAccountFields,
  IGMediaFields,
  IGInsightsResponse,
} from '@creator-hub/types'

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

const MEDIA_INSIGHTS_METRICS = [
  'reach',
  'impressions',
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
  accessToken: string
): Promise<IGMediaFields[]> {
  const allMedia: IGMediaFields[] = []
  let after: string | undefined

  do {
    const page = await fetchMediaPage(igUserId, accessToken, after)
    allMedia.push(...page.data)
    after = page.paging?.cursors?.after
    if (!page.paging?.next) break
  } while (after)

  return allMedia
}

export async function fetchMediaInsights(
  mediaId: string,
  mediaType: string,
  accessToken: string
): Promise<IGInsightsResponse> {
  const isStory = mediaType === 'STORY'
  const metrics = isStory
    ? ['reach', 'impressions', 'replies'].join(',')
    : MEDIA_INSIGHTS_METRICS.join(',')

  return graphGet<IGInsightsResponse>(
    `/${mediaId}/insights`,
    { metric: metrics, period: 'lifetime' },
    accessToken
  )
}
