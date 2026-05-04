import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { MediaType } from '@creator-hub/types'
import { fetchMediaPage } from './instagram-client'
import { sleep, withBackoff } from './rate-limit'

// V1 archive backfill — metadata-only. Walks /me/media newest → older
// with persisted Meta `after` cursor. Reuses raw_instagram_media + posts
// upsert shape from sync-media.ts (intentionally duplicated, see
// REFACTOR NOTE below). Marks each touched post in post_archive_state
// with metadata_status='imported'. Does NOT call /insights, does NOT run
// AI, does NOT touch embeddings, does NOT register a cron.
//
// REFACTOR NOTE: the small upsert routine here is a near-copy of
// sync-media.ts. We chose duplication over extraction for V1 so the
// live sync path stays untouched. Once the archive backfill has been
// validated end-to-end, factor `upsertMediaAndPost` into a shared helper.

export const ARCHIVE_JOB_NAME = 'meta.media.archive_backfill'

export const DEFAULT_PAGE_BUDGET    = 5
export const MAX_PAGE_BUDGET        = 10
export const DEFAULT_TIME_BUDGET_MS = 60_000
export const MAX_TIME_BUDGET_MS     = 90_000
const INTER_PAGE_SLEEP_MS           = 250

// Anything older than this with status='running' is considered a dead
// run and is force-released before the next acquire. Sized well above
// MAX_TIME_BUDGET_MS (90s) and route maxDuration (120s) to avoid
// killing legitimate in-flight work.
export const STALE_RUNNING_THRESHOLD_MS = 5 * 60_000

export type ArchiveBackfillOptions = {
  pageBudget?:   number
  timeBudgetMs?: number
}

export type ArchiveBackfillResult = {
  jobName:        string
  status:         'idle' | 'running' | 'paused' | 'complete' | 'error'
  startedThisRun: boolean
  fetchedThisRun: number
  upsertedThisRun: number
  skippedThisRun: number
  errorThisRun:   boolean
  pagesThisRun:   number
  staleCleared:   boolean
  totals: {
    fetchedCount:  number
    upsertedCount: number
    skippedCount:  number
    errorCount:    number
  }
  cursor:               string | null
  lastProcessedMediaId: string | null
  reachedEndOfArchive:  boolean
  stoppedReason:
    | 'page_budget'
    | 'time_budget'
    | 'end_of_archive'
    | 'already_running'
    | 'error'
}

type DbMediaType = Database['public']['Enums']['media_type']

function normalizeMediaType(mt: MediaType): DbMediaType {
  switch (mt) {
    case 'REEL':  return 'VIDEO'
    case 'STORY': return 'IMAGE'
    case 'IMAGE':
    case 'VIDEO':
    case 'CAROUSEL_ALBUM':
      return mt
  }
}

function clampPageBudget(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return DEFAULT_PAGE_BUDGET
  return Math.max(1, Math.min(MAX_PAGE_BUDGET, Math.floor(v)))
}

function clampTimeBudget(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return DEFAULT_TIME_BUDGET_MS
  return Math.max(1_000, Math.min(MAX_TIME_BUDGET_MS, Math.floor(v)))
}

// Treat 4xx (except 429) as non-retryable: replaying with the same
// arguments will yield the same failure. Network and 5xx propagate
// through withBackoff's default retry behavior.
function shouldRetryMetaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  const m = message.match(/Meta API (\d{3})/)
  if (!m) return true
  const code = Number.parseInt(m[1]!, 10)
  if (code === 429) return true
  if (code >= 400 && code < 500) return false
  return true
}

export type SupabaseClient = ReturnType<typeof createClient<Database>>

export async function runArchiveMediaBackfill(
  config: {
    supabaseUrl:  string
    supabaseKey:  string
    igUserId:     string
    accessToken:  string
  },
  options: ArchiveBackfillOptions = {}
): Promise<ArchiveBackfillResult> {
  const pageBudget   = clampPageBudget(options.pageBudget)
  const timeBudgetMs = clampTimeBudget(options.timeBudgetMs)
  const deadline     = Date.now() + timeBudgetMs

  const supabase = createClient<Database>(config.supabaseUrl, config.supabaseKey)

  // 1) Resolve the posts.account_id FK once. The archive cannot run
  //    until the live sync has populated `accounts` for this IG user.
  const { data: accountRow, error: accountErr } = await supabase
    .from('accounts')
    .select('id')
    .eq('instagram_id', config.igUserId)
    .maybeSingle()

  if (accountErr) {
    throw new Error(`accounts lookup failed: ${accountErr.message}`)
  }
  if (!accountRow) {
    throw new Error(
      `no accounts row for instagram_id=${config.igUserId} — run /api/meta/sync first`
    )
  }
  const accountRowId = accountRow.id

  // 2) Ensure cursor row exists.
  let cursorRow = await ensureCursorRow(supabase)

  // 3) Stale-running recovery. If a previous run died with status='running'
  //    and ran_at older than STALE_RUNNING_THRESHOLD_MS, force-release it
  //    by transitioning to 'error' with a breadcrumb. The atomic acquire
  //    below will then pick it back up. Uses ran_at (not started_at) so
  //    long-running jobs that legitimately update their ran_at every page
  //    are never falsely classified as stale.
  const staleCleared = await clearStaleRunning(supabase)
  if (staleCleared) {
    const refreshed = await loadCursorRow(supabase)
    if (refreshed) cursorRow = refreshed
  }

  // 4) Short-circuit on terminal 'complete' BEFORE attempting the lock,
  //    so scheduled ticks against a finished archive don't churn the
  //    cursor row or log spam.
  if (cursorRow.status === 'complete') {
    return earlyResult({
      cursorRow,
      status:              'complete',
      reachedEndOfArchive: true,
      stoppedReason:       'end_of_archive',
      staleCleared,
    })
  }

  // 5) Atomic lock acquire. The conditional UPDATE both guards against
  //    racing writers and returns the freshly-locked row in one trip.
  const locked = await acquireLock(supabase, cursorRow.started_at)
  if (!locked) {
    // Either another worker holds the lock, or status flipped to
    // 'complete' between the short-circuit check and acquire. Re-read
    // and return the truthful current state.
    const fresh = (await loadCursorRow(supabase)) ?? cursorRow
    if (fresh.status === 'complete') {
      return earlyResult({
        cursorRow:           fresh,
        status:              'complete',
        reachedEndOfArchive: true,
        stoppedReason:       'end_of_archive',
        staleCleared,
      })
    }
    return earlyResult({
      cursorRow:           fresh,
      status:              'running',
      reachedEndOfArchive: false,
      stoppedReason:       'already_running',
      staleCleared,
    })
  }
  cursorRow = locked

  let fetchedThisRun  = 0
  let upsertedThisRun = 0
  let skippedThisRun  = 0
  let pagesThisRun    = 0
  let errorThisRun    = false
  let lastError: string | null = null

  let after: string | undefined = cursorRow.cursor ?? undefined
  let lastProcessedMediaId: string | null = cursorRow.last_processed_media_id
  let reachedEndOfArchive = false
  let stoppedReason: ArchiveBackfillResult['stoppedReason'] = 'page_budget'

  try {
    for (let i = 0; i < pageBudget; i++) {
      if (Date.now() >= deadline) {
        stoppedReason = 'time_budget'
        break
      }

      const page = await withBackoff(
        () => fetchMediaPage(config.igUserId, config.accessToken, after),
        { shouldRetry: shouldRetryMetaError }
      )

      pagesThisRun += 1
      const items = page.data ?? []
      fetchedThisRun += items.length

      // Per-page upsert. We persist the cursor only after every item in
      // the page has committed, so a crash mid-page replays the page on
      // the next run (idempotent via on-conflict on media_id).
      for (const media of items) {
        try {
          const result = await upsertMediaAndPost(
            supabase,
            media,
            config.igUserId,
            accountRowId
          )
          if (result === 'skipped') {
            skippedThisRun += 1
          } else {
            upsertedThisRun += 1
            lastProcessedMediaId = media.id
          }
        } catch (err) {
          // Per-item failures are logged but don't kill the run; we
          // continue with the next item and bump error_count.
          errorThisRun = true
          lastError = err instanceof Error ? err.message : String(err)
          skippedThisRun += 1
        }
      }

      const nextAfter      = page.paging?.cursors?.after
      const hasNextPage    = Boolean(page.paging?.next)

      // Persist cursor + counters only now (after the page committed).
      // ran_at refresh here also doubles as a stale-lock heartbeat.
      const { error: updErr } = await supabase
        .from('ingestion_cursors')
        .update({
          cursor:                  nextAfter ?? null,
          last_processed_media_id: lastProcessedMediaId,
          fetched_count:           cursorRow.fetched_count  + fetchedThisRun,
          upserted_count:          cursorRow.upserted_count + upsertedThisRun,
          skipped_count:           cursorRow.skipped_count  + skippedThisRun,
          error_count:             cursorRow.error_count    + (errorThisRun ? 1 : 0),
          ran_at:                  new Date().toISOString(),
          last_error:              lastError,
        })
        .eq('job_name', ARCHIVE_JOB_NAME)
      if (updErr) throw new Error(`ingestion_cursors update failed: ${updErr.message}`)

      after = nextAfter

      if (!hasNextPage || !nextAfter) {
        reachedEndOfArchive = true
        stoppedReason = 'end_of_archive'
        break
      }

      if (Date.now() >= deadline) {
        stoppedReason = 'time_budget'
        break
      }

      await sleep(INTER_PAGE_SLEEP_MS)
    }
  } catch (err) {
    errorThisRun = true
    lastError = err instanceof Error ? err.message : String(err)
    stoppedReason = 'error'
    await supabase
      .from('ingestion_cursors')
      .update({
        status:     'error',
        last_error: lastError,
        error_count: cursorRow.error_count + 1,
        ran_at:     new Date().toISOString(),
      })
      .eq('job_name', ARCHIVE_JOB_NAME)

    const fresh = await loadCursorRow(supabase)
    return buildResult({
      cursorRow:           fresh ?? cursorRow,
      status:              'error',
      startedThisRun:      true,
      fetchedThisRun,
      upsertedThisRun,
      skippedThisRun,
      errorThisRun,
      pagesThisRun,
      staleCleared,
      reachedEndOfArchive: false,
      stoppedReason:       'error',
    })
  }

  // 6) Mark final status.
  const finalStatus: 'complete' | 'idle' = reachedEndOfArchive ? 'complete' : 'idle'
  const finishedAt = reachedEndOfArchive ? new Date().toISOString() : null
  {
    const { error } = await supabase
      .from('ingestion_cursors')
      .update({
        status:       finalStatus,
        finished_at:  finishedAt,
        ran_at:       new Date().toISOString(),
      })
      .eq('job_name', ARCHIVE_JOB_NAME)
    if (error) throw new Error(`ingestion_cursors finalize failed: ${error.message}`)
  }

  const fresh = await loadCursorRow(supabase)
  return buildResult({
    cursorRow:           fresh ?? cursorRow,
    status:              finalStatus,
    startedThisRun:      true,
    fetchedThisRun,
    upsertedThisRun,
    skippedThisRun,
    errorThisRun,
    pagesThisRun,
    staleCleared,
    reachedEndOfArchive,
    stoppedReason,
  })
}

async function loadCursorRow(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('ingestion_cursors')
    .select('*')
    .eq('job_name', ARCHIVE_JOB_NAME)
    .maybeSingle()
  if (error) throw new Error(`ingestion_cursors load failed: ${error.message}`)
  return data
}

type CursorRow = NonNullable<Awaited<ReturnType<typeof loadCursorRow>>>

async function ensureCursorRow(supabase: SupabaseClient): Promise<CursorRow> {
  const existing = await loadCursorRow(supabase)
  if (existing) return existing
  const { data, error } = await supabase
    .from('ingestion_cursors')
    .insert({ job_name: ARCHIVE_JOB_NAME, status: 'idle' })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`ingestion_cursors insert failed: ${error?.message ?? 'unknown'}`)
  }
  return data
}

// Force-release a dead lock. Returns true iff a stale row was rewritten.
// Uses ran_at as the heartbeat: every successful page commit refreshes
// ran_at, so a healthy run is never classified as stale.
async function clearStaleRunning(supabase: SupabaseClient): Promise<boolean> {
  const cutoffIso = new Date(Date.now() - STALE_RUNNING_THRESHOLD_MS).toISOString()
  const breadcrumb = `stale lock cleared at ${new Date().toISOString()}`
  const { data, error } = await supabase
    .from('ingestion_cursors')
    .update({
      status:     'error',
      last_error: breadcrumb,
    })
    .eq('job_name', ARCHIVE_JOB_NAME)
    .eq('status', 'running')
    .lt('ran_at', cutoffIso)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`ingestion_cursors stale clear failed: ${error.message}`)
  return !!data
}

// Atomic lock acquire. Returns the locked row if we won the race,
// null if another caller already holds the lock or the job is in a
// terminal state. Preserves an existing `started_at` (treated as the
// first-ever historical start of this job); only stamps `now()` when
// no prior start exists.
async function acquireLock(
  supabase:        SupabaseClient,
  preservedStart:  string | null
): Promise<CursorRow | null> {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('ingestion_cursors')
    .update({
      status:     'running',
      ran_at:     nowIso,
      started_at: preservedStart ?? nowIso,
      last_error: null,
    })
    .eq('job_name', ARCHIVE_JOB_NAME)
    .in('status', ['idle', 'paused', 'error'])
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`ingestion_cursors lock acquire failed: ${error.message}`)
  return data
}

function earlyResult(args: {
  cursorRow:           CursorRow
  status:              ArchiveBackfillResult['status']
  reachedEndOfArchive: boolean
  stoppedReason:       ArchiveBackfillResult['stoppedReason']
  staleCleared:        boolean
}): ArchiveBackfillResult {
  return buildResult({
    cursorRow:           args.cursorRow,
    status:              args.status,
    startedThisRun:      false,
    fetchedThisRun:      0,
    upsertedThisRun:     0,
    skippedThisRun:      0,
    errorThisRun:        false,
    pagesThisRun:        0,
    staleCleared:        args.staleCleared,
    reachedEndOfArchive: args.reachedEndOfArchive,
    stoppedReason:       args.stoppedReason,
  })
}

function buildResult(args: {
  cursorRow:           CursorRow
  status:              ArchiveBackfillResult['status']
  startedThisRun:      boolean
  fetchedThisRun:      number
  upsertedThisRun:     number
  skippedThisRun:      number
  errorThisRun:        boolean
  pagesThisRun:        number
  staleCleared:        boolean
  reachedEndOfArchive: boolean
  stoppedReason:       ArchiveBackfillResult['stoppedReason']
}): ArchiveBackfillResult {
  return {
    jobName: ARCHIVE_JOB_NAME,
    status:  args.status,
    startedThisRun:  args.startedThisRun,
    fetchedThisRun:  args.fetchedThisRun,
    upsertedThisRun: args.upsertedThisRun,
    skippedThisRun:  args.skippedThisRun,
    errorThisRun:    args.errorThisRun,
    pagesThisRun:    args.pagesThisRun,
    staleCleared:    args.staleCleared,
    totals: {
      fetchedCount:  args.cursorRow.fetched_count,
      upsertedCount: args.cursorRow.upserted_count,
      skippedCount:  args.cursorRow.skipped_count,
      errorCount:    args.cursorRow.error_count,
    },
    cursor:               args.cursorRow.cursor,
    lastProcessedMediaId: args.cursorRow.last_processed_media_id,
    reachedEndOfArchive:  args.reachedEndOfArchive,
    stoppedReason:        args.stoppedReason,
  }
}

export type IGMediaItem = {
  id:         string
  media_type: MediaType
  caption?:   string
  permalink:  string
  timestamp:  string
}

// Exported so the windowed archive worker
// (`archive-backfill-windowed.ts`) can reuse the exact same upsert
// shape without forking a third copy. Body and return type are
// intentionally unchanged: the legacy cursor worker's counters and
// behavior must remain identical. See REFACTOR NOTE at the top of
// this file.
export async function upsertMediaAndPost(
  supabase: SupabaseClient,
  media:    IGMediaItem,
  igUserId: string,
  accountRowId: string
): Promise<'upserted' | 'skipped'> {
  // raw_instagram_media: idempotent upsert on media_id.
  const { error: rawErr } = await supabase
    .from('raw_instagram_media')
    .upsert(
      {
        media_id:   media.id,
        account_id: igUserId,
        media_type: normalizeMediaType(media.media_type),
        caption:    media.caption ?? null,
        permalink:  media.permalink,
        timestamp:  media.timestamp,
        raw_json:   media as unknown as Database['public']['Tables']['raw_instagram_media']['Insert']['raw_json'],
      },
      { onConflict: 'media_id' }
    )
  if (rawErr) throw new Error(`raw_instagram_media upsert ${media.id}: ${rawErr.message}`)

  // posts: insert if missing, update if present. Mirrors sync-media.ts.
  const { data: existing, error: selErr } = await supabase
    .from('posts')
    .select('id')
    .eq('media_id', media.id)
    .maybeSingle()
  if (selErr) throw new Error(`posts lookup ${media.id}: ${selErr.message}`)

  let postId: string
  if (existing) {
    const { error } = await supabase
      .from('posts')
      .update({
        media_type: normalizeMediaType(media.media_type),
        caption:    media.caption ?? null,
        permalink:  media.permalink,
        posted_at:  media.timestamp,
      })
      .eq('id', existing.id)
    if (error) throw new Error(`posts update ${media.id}: ${error.message}`)
    postId = existing.id
  } else {
    const { data, error } = await supabase
      .from('posts')
      .insert({
        account_id: accountRowId,
        media_id:   media.id,
        media_type: normalizeMediaType(media.media_type),
        caption:    media.caption ?? null,
        permalink:  media.permalink,
        posted_at:  media.timestamp,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`posts insert ${media.id}: ${error?.message ?? 'unknown'}`)
    postId = data.id
  }

  // post_archive_state: stamp metadata_status='imported', last_indexed_at=now().
  // Other axes remain at their non-pending defaults (`not_requested` /
  // `not_started` / `pending`) — V1 must not imply queued work.
  const { error: stateErr } = await supabase
    .from('post_archive_state')
    .upsert(
      {
        post_id:         postId,
        metadata_status: 'imported',
        last_indexed_at: new Date().toISOString(),
        last_error:      null,
      },
      { onConflict: 'post_id' }
    )
  if (stateErr) throw new Error(`post_archive_state upsert ${media.id}: ${stateErr.message}`)

  return 'upserted'
}
