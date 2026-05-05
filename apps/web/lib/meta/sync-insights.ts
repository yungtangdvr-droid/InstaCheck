import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { SyncInsightsResult } from '@creator-hub/types'
import { fetchMediaInsights } from './instagram-client'

type PostMetricsInsert = Database['public']['Tables']['post_metrics_daily']['Insert']
type DailyColumn = 'reach' | 'impressions' | 'saves' | 'shares' | 'likes' | 'comments' | 'profile_visits'

// Meta metric name → post_metrics_daily column. `views` is the v21+ replacement
// for `impressions` on media insights; we still project it to `impressions` so
// the analytics layer stays stable.
const METRIC_TO_COLUMN: Record<string, DailyColumn> = {
  reach:          'reach',
  impressions:    'impressions',
  views:          'impressions',
  saved:          'saves',
  shares:         'shares',
  likes:          'likes',
  comments:       'comments',
  profile_visits: 'profile_visits',
}

export async function syncInsightsForMedia(
  supabase:    ReturnType<typeof createClient<Database>>,
  postId:      string,
  mediaId:     string,
  mediaType:   string,
  accessToken: string
): Promise<SyncInsightsResult> {
  const response = await fetchMediaInsights(mediaId, mediaType, accessToken)

  let metricsStored = 0
  const daily: Partial<Record<DailyColumn, number>> = {}

  for (const insight of response.data) {
    const raw = insight.values?.[0]?.value
    if (raw === null || raw === undefined) continue
    const numericValue = typeof raw === 'number' ? raw : null
    if (numericValue === null) continue

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

    const column = METRIC_TO_COLUMN[insight.name]
    if (column) daily[column] = numericValue
  }

  if (metricsStored > 0) {
    const today = new Date().toISOString().split('T')[0]
    const row: PostMetricsInsert = {
      post_id: postId,
      date:    today,
      ...daily,
    }

    const { error } = await supabase
      .from('post_metrics_daily')
      .upsert(row, { onConflict: 'post_id,date' })

    if (error) throw new Error(`post_metrics_daily upsert ${postId}: ${error.message}`)
  }

  return { mediaId, metricsStored }
}

export type SyncInsightsBatchResult = {
  results: SyncInsightsResult[]
  errors:  string[]
}

const DEFAULT_INSIGHTS_DAYS  = 90
const DEFAULT_INSIGHTS_LIMIT = 200

// Bound the live insights loop to a fresh window so the archive
// (metadata-only backfill, see lib/meta/archive-backfill.ts) cannot
// starve recently-published posts of their daily refresh. Meta's
// /{media-id}/insights endpoint only returns useful values for
// recent media anyway; older content is covered by the archive path.
function resolveInsightsDays(): number {
  const raw = process.env.META_SYNC_INSIGHTS_DAYS
  if (!raw) return DEFAULT_INSIGHTS_DAYS
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INSIGHTS_DAYS
}

function resolveInsightsLimit(): number {
  const raw = process.env.META_SYNC_INSIGHTS_LIMIT
  if (!raw) return DEFAULT_INSIGHTS_LIMIT
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INSIGHTS_LIMIT
}

export async function syncInsightsForAllPosts(
  supabase:     ReturnType<typeof createClient<Database>>,
  accountRowId: string,
  accessToken:  string
): Promise<SyncInsightsBatchResult> {
  const days     = resolveInsightsDays()
  const limit    = resolveInsightsLimit()
  const cutoffMs = Date.now() - days * 86_400_000
  const sinceIso = new Date(cutoffMs).toISOString()

  const { data: posts, error } = await supabase
    .from('posts')
    .select('id, media_id, media_type, posted_at')
    .eq('account_id', accountRowId)
    .gte('posted_at', sinceIso)
    .order('posted_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) throw new Error(`posts select: ${error.message}`)
  if (!posts?.length) return { results: [], errors: [] }

  const results: SyncInsightsResult[] = []
  const errors:  string[] = []

  const BATCH = 10
  for (let i = 0; i < posts.length; i += BATCH) {
    const batch = posts.slice(i, i + BATCH)
    const batchResults = await Promise.allSettled(
      batch.map((p) =>
        syncInsightsForMedia(supabase, p.id, p.media_id, p.media_type ?? '', accessToken)
      )
    )

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j]
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        const mediaId = batch[j].media_id
        const msg = result.reason instanceof Error ? result.reason.message : String(result.reason)
        errors.push(`${mediaId}: ${msg}`)
        console.error(`[syncInsights] ${mediaId}:`, msg)
      }
    }
  }

  return { results, errors }
}
