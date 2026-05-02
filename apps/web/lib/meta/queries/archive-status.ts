import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import { ARCHIVE_JOB_NAME } from '@/lib/meta/archive-backfill'

// Read-only counters surfaced by /content-lab/archive. Issues a small
// number of `head: true, count: 'exact'` queries — no row data returned.

export type ArchiveStatusCounts = {
  postsTotal:                 number
  archiveStateRows:           number
  metadataImported:           number
  metricsNotRequested:        number
  metricsQueued:              number
  metricsSynced:              number
  embeddingNotStarted:        number
  embeddingQueued:            number
  embeddingDone:              number
  aiTaggingNotStarted:        number
  aiTaggingQueued:            number
  aiTaggingTagged:            number
  humanReviewPending:         number
  humanReviewApproved:        number
  patternPending:             number
  patternLinked:              number
}

export type ArchiveCursorView = {
  jobName:                string
  status:                 string
  cursor:                 string | null
  lastProcessedMediaId:   string | null
  fetchedCount:           number
  upsertedCount:          number
  skippedCount:           number
  errorCount:             number
  startedAt:              string | null
  ranAt:                  string | null
  finishedAt:             string | null
  lastError:              string | null
}

type Db = SupabaseClient<Database>

async function countTable(
  supabase: Db,
  table:   'posts' | 'post_archive_state'
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { head: true, count: 'exact' })
  if (error) throw new Error(`${table} count failed: ${error.message}`)
  return count ?? 0
}

async function countArchiveStatus(
  supabase: Db,
  column:   keyof Database['public']['Tables']['post_archive_state']['Row'],
  value:    string
): Promise<number> {
  const { count, error } = await supabase
    .from('post_archive_state')
    .select('*', { head: true, count: 'exact' })
    .eq(column, value)
  if (error) throw new Error(`post_archive_state count by ${String(column)}=${value} failed: ${error.message}`)
  return count ?? 0
}

export async function getArchiveStatusCounts(supabase: Db): Promise<ArchiveStatusCounts> {
  const [
    postsTotal,
    archiveStateRows,
    metadataImported,
    metricsNotRequested,
    metricsQueued,
    metricsSynced,
    embeddingNotStarted,
    embeddingQueued,
    embeddingDone,
    aiTaggingNotStarted,
    aiTaggingQueued,
    aiTaggingTagged,
    humanReviewPending,
    humanReviewApproved,
    patternPending,
    patternLinked,
  ] = await Promise.all([
    countTable(supabase, 'posts'),
    countTable(supabase, 'post_archive_state'),
    countArchiveStatus(supabase, 'metadata_status',     'imported'),
    countArchiveStatus(supabase, 'metrics_status',      'not_requested'),
    countArchiveStatus(supabase, 'metrics_status',      'queued'),
    countArchiveStatus(supabase, 'metrics_status',      'synced'),
    countArchiveStatus(supabase, 'embedding_status',    'not_started'),
    countArchiveStatus(supabase, 'embedding_status',    'queued'),
    countArchiveStatus(supabase, 'embedding_status',    'done'),
    countArchiveStatus(supabase, 'ai_tagging_status',   'not_started'),
    countArchiveStatus(supabase, 'ai_tagging_status',   'queued'),
    countArchiveStatus(supabase, 'ai_tagging_status',   'tagged'),
    countArchiveStatus(supabase, 'human_review_status', 'pending'),
    countArchiveStatus(supabase, 'human_review_status', 'approved'),
    countArchiveStatus(supabase, 'pattern_status',      'pending'),
    countArchiveStatus(supabase, 'pattern_status',      'linked'),
  ])

  return {
    postsTotal,
    archiveStateRows,
    metadataImported,
    metricsNotRequested,
    metricsQueued,
    metricsSynced,
    embeddingNotStarted,
    embeddingQueued,
    embeddingDone,
    aiTaggingNotStarted,
    aiTaggingQueued,
    aiTaggingTagged,
    humanReviewPending,
    humanReviewApproved,
    patternPending,
    patternLinked,
  }
}

export async function getArchiveCursor(supabase: Db): Promise<ArchiveCursorView | null> {
  const { data, error } = await supabase
    .from('ingestion_cursors')
    .select(
      'job_name, status, cursor, last_processed_media_id, fetched_count, upserted_count, skipped_count, error_count, started_at, ran_at, finished_at, last_error'
    )
    .eq('job_name', ARCHIVE_JOB_NAME)
    .maybeSingle()
  if (error) throw new Error(`ingestion_cursors load failed: ${error.message}`)
  if (!data) return null
  return {
    jobName:              data.job_name,
    status:               data.status,
    cursor:               data.cursor,
    lastProcessedMediaId: data.last_processed_media_id,
    fetchedCount:         data.fetched_count,
    upsertedCount:        data.upserted_count,
    skippedCount:         data.skipped_count,
    errorCount:           data.error_count,
    startedAt:            data.started_at,
    ranAt:                data.ran_at,
    finishedAt:           data.finished_at,
    lastError:            data.last_error,
  }
}
