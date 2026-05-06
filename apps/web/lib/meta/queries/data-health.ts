import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

import { getArchiveCursor, type ArchiveCursorView } from './archive-status'

type Db = SupabaseClient<Database>
type MediaType = Database['public']['Enums']['media_type']

const MEDIA_TYPES: readonly MediaType[] = ['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM'] as const

export type DataHealthCoverageCell = {
  postsTotal:        number
  postsWithMetrics:  number
}

export type DataHealthSnapshot = {
  archive: {
    rawMediaCount:         number
    postsCount:            number
    rawInsightsCount:      number
    postMetricsDailyCount: number
  }
  cursor: ArchiveCursorView | null
  recent7dByMediaType: Record<MediaType, DataHealthCoverageCell>
  recent30d: DataHealthCoverageCell
}

async function countTable(
  supabase: Db,
  table:    'raw_instagram_media' | 'posts' | 'raw_instagram_media_insights' | 'post_metrics_daily',
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { head: true, count: 'exact' })
  if (error) throw new Error(`${table} count failed: ${error.message}`)
  return count ?? 0
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export function coveragePct(cell: DataHealthCoverageCell): number {
  if (cell.postsTotal === 0) return 0
  return cell.postsWithMetrics / cell.postsTotal
}

/**
 * Snapshot of ingestion health for the operator.
 * Recent coverage is derived from the source tables (`posts` + `post_metrics_daily`),
 * not the analytics mart — a metrics row existing is enough to count as covered.
 */
export async function getDataHealthSnapshot(supabase: Db): Promise<DataHealthSnapshot> {
  const cutoff30d = isoDaysAgo(30)
  const cutoff7d  = isoDaysAgo(7)

  const [
    rawMediaCount,
    postsCount,
    rawInsightsCount,
    postMetricsDailyCount,
    cursor,
    recentPostsRes,
  ] = await Promise.all([
    countTable(supabase, 'raw_instagram_media'),
    countTable(supabase, 'posts'),
    countTable(supabase, 'raw_instagram_media_insights'),
    countTable(supabase, 'post_metrics_daily'),
    getArchiveCursor(supabase),
    supabase
      .from('posts')
      .select('id, media_type, posted_at')
      .gte('posted_at', cutoff30d),
  ])

  if (recentPostsRes.error) {
    throw new Error(`posts(last 30d) load failed: ${recentPostsRes.error.message}`)
  }

  const recentPosts = recentPostsRes.data ?? []
  const recentIds   = recentPosts.map((p) => p.id)

  const postsWithMetricsSet = new Set<string>()
  if (recentIds.length > 0) {
    const { data: metricRows, error: metricsErr } = await supabase
      .from('post_metrics_daily')
      .select('post_id')
      .in('post_id', recentIds)
    if (metricsErr) {
      throw new Error(`post_metrics_daily(recent) load failed: ${metricsErr.message}`)
    }
    for (const row of metricRows ?? []) {
      if (row.post_id) postsWithMetricsSet.add(row.post_id)
    }
  }

  const recent7dByMediaType: Record<MediaType, DataHealthCoverageCell> = {
    IMAGE:          { postsTotal: 0, postsWithMetrics: 0 },
    VIDEO:          { postsTotal: 0, postsWithMetrics: 0 },
    CAROUSEL_ALBUM: { postsTotal: 0, postsWithMetrics: 0 },
  }
  const recent30d: DataHealthCoverageCell = { postsTotal: 0, postsWithMetrics: 0 }

  for (const post of recentPosts) {
    const hasMetrics = postsWithMetricsSet.has(post.id)
    recent30d.postsTotal       += 1
    if (hasMetrics) recent30d.postsWithMetrics += 1

    if (post.posted_at >= cutoff7d && MEDIA_TYPES.includes(post.media_type)) {
      const cell = recent7dByMediaType[post.media_type]
      cell.postsTotal       += 1
      if (hasMetrics) cell.postsWithMetrics += 1
    }
  }

  return {
    archive: {
      rawMediaCount,
      postsCount,
      rawInsightsCount,
      postMetricsDailyCount,
    },
    cursor,
    recent7dByMediaType,
    recent30d,
  }
}

export const DATA_HEALTH_MEDIA_TYPES: readonly MediaType[] = MEDIA_TYPES
export type { MediaType as DataHealthMediaType }
