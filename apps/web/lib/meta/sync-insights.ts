import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { SyncInsightsResult } from '@creator-hub/types'
import { fetchMediaInsights } from './instagram-client'

type DailyMetricColumn =
  | 'reach'
  | 'impressions'
  | 'saves'
  | 'shares'
  | 'likes'
  | 'comments'
  | 'profile_visits'

const METRIC_TO_DAILY_COLUMN: Record<string, DailyMetricColumn> = {
  reach:          'reach',
  impressions:    'impressions',
  saved:          'saves',
  shares:         'shares',
  likes:          'likes',
  comments:       'comments',
  profile_visits: 'profile_visits',
}

export async function syncInsightsForMedia(
  supabase: ReturnType<typeof createClient<Database>>,
  mediaId: string,
  mediaType: string,
  accessToken: string,
  postId?: string
): Promise<SyncInsightsResult> {
  const response = await fetchMediaInsights(mediaId, mediaType, accessToken)

  let metricsStored = 0
  const dailyMetrics: Partial<Record<DailyMetricColumn, number>> = {}

  for (const insight of response.data) {
    const value = insight.values?.[0]?.value ?? null

    if (value === null) continue

    const numericValue = typeof value === 'number' ? value : null

    const { error } = await supabase
      .from('raw_instagram_media_insights')
      .upsert(
        {
          media_id:    mediaId,
          metric_name: insight.name,
          value:       numericValue,
          period:      insight.period,
        },
        { onConflict: 'media_id,metric_name,period' }
      )

    if (error) throw new Error(`raw_instagram_media_insights upsert ${mediaId}/${insight.name}: ${error.message}`)
    metricsStored++

    if (numericValue !== null) {
      const column = METRIC_TO_DAILY_COLUMN[insight.name]
      if (column) dailyMetrics[column] = numericValue
    }
  }

  if (postId && Object.keys(dailyMetrics).length > 0) {
    const today = new Date().toISOString().split('T')[0]
    const { error: dailyErr } = await supabase
      .from('post_metrics_daily')
      .upsert(
        { post_id: postId, date: today, ...dailyMetrics },
        { onConflict: 'post_id,date' }
      )

    if (dailyErr) throw new Error(`post_metrics_daily upsert ${mediaId}: ${dailyErr.message}`)
  }

  return { mediaId, metricsStored }
}

export async function syncInsightsForAllPosts(
  supabase: ReturnType<typeof createClient<Database>>,
  igUserId: string,
  accessToken: string
): Promise<SyncInsightsResult[]> {
  const { data: posts, error } = await supabase
    .from('posts')
    .select('id, media_id, media_type')
    .eq('account_id', igUserId)

  if (error) throw new Error(`posts select: ${error.message}`)
  if (!posts?.length) return []

  const results: SyncInsightsResult[] = []

  const BATCH = 10
  for (let i = 0; i < posts.length; i += BATCH) {
    const batch = posts.slice(i, i + BATCH)
    const batchResults = await Promise.allSettled(
      batch.map((p) =>
        syncInsightsForMedia(supabase, p.media_id, p.media_type ?? '', accessToken, p.id)
      )
    )

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        console.error('[syncInsights] error:', result.reason?.message ?? 'unknown')
      }
    }
  }

  return results
}
