import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import { fetchMediaInsights } from './instagram-client'
import { sleep, withBackoff } from './rate-limit'
import { syncInsightsForMedia } from './sync-insights'
import {
  classifyInsightsError,
  classifyInsightsResponse,
  type TInsightsErrorClass,
} from './classify-insights-error'
import type { SupabaseClient } from './archive-backfill'

// V1 archive METRICS backfill — historical /insights filler. Walks
// `posts` rows that are missing a `post_metrics_daily` entry, calls
// Meta /{media-id}/insights for each, and persists the results via
// the existing `syncInsightsForMedia` helper. Does NOT touch the
// metadata-only archive backfill cursor (`meta.media.archive_backfill`).
// Does NOT modify the live sync path.
//
// Per-post terminal classification uses `classifyInsightsError` /
// `classifyInsightsResponse`, then writes the outcome to
// `post_archive_state.metrics_status`:
//   - 'synced'  — Meta returned >=1 numeric value, rows persisted.
//   - 'skipped' — Meta refused or returned no usable values for a
//                 reason that won't change on retry
//                 (before_business_conversion, unsupported_media_type,
//                 unsupported_metric, permission_error, empty_data,
//                 basic_fields_only).
//   - 'error'   — transient (rate_limit, network, 5xx, unknown). The
//                 next tick will pick the post back up.
//   - 'queued'  — set just before the per-post call; visible if the
//                 process dies mid-call.
//
// Idempotency: each per-post write uses upsert on
// (media_id, metric_name, period) and (post_id, date), so re-running
// the same post is safe.

export const METRICS_JOB_NAME = 'meta.media.archive_metrics_backfill'

export const DEFAULT_PAGE_BUDGET    = 50
export const MAX_PAGE_BUDGET        = 200
export const DEFAULT_TIME_BUDGET_MS = 60_000
export const MAX_TIME_BUDGET_MS     = 90_000

// Per-post spacing. Lets us stay well under Meta's 200 req/h app
// budget at any reasonable pageBudget (50 posts/tick @ 250ms ≈ 12s
// of Meta calls per tick). The hourly live sync still has plenty of
// budget headroom.
const INTER_POST_SLEEP_MS = 250

// Same heartbeat threshold as the metadata worker. Sized well above
// MAX_TIME_BUDGET_MS and the route maxDuration so a healthy tick is
// never falsely classified as stale.
export const STALE_RUNNING_THRESHOLD_MS = 5 * 60_000

// PostgREST `.in('post_id', ids)` URL-encodes every UUID, so chunk
// the lookup to stay well under any URL-length limit. Mirrors the
// constant used in scripts/probe-archive-insights.ts.
const ID_LOOKUP_CHUNK_SIZE = 100

// Terminal classes — updating metrics_status to 'skipped' marks the
// post as not retryable until an operator manually flips it back.
const TERMINAL_CLASSES: ReadonlySet<TInsightsErrorClass> = new Set([
  'before_business_conversion',
  'unsupported_media_type',
  'unsupported_metric',
  'permission_error',
  'empty_data',
  'basic_fields_only',
])

export type ArchiveMetricsBackfillOptions = {
  pageBudget?:   number
  timeBudgetMs?: number
  dryRun?:       boolean
}

export type ArchiveMetricsBackfillResult = {
  jobName:        string
  status:         'idle' | 'running' | 'paused' | 'complete' | 'error'
  startedThisRun: boolean
  dryRun:         boolean
  processedThisRun: number
  syncedThisRun:    number
  skippedThisRun:   number
  errorThisRun:     number
  staleCleared:   boolean
  totals: {
    fetchedCount:  number
    upsertedCount: number
    skippedCount:  number
    errorCount:    number
  }
  candidatesScanned: number
  reachedEndOfBacklog: boolean
  stoppedReason:
    | 'page_budget'
    | 'time_budget'
    | 'end_of_backlog'
    | 'already_running'
    | 'error'
  classCounts: Partial<Record<TInsightsErrorClass | 'available', number>>
}

function clampPageBudget(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return DEFAULT_PAGE_BUDGET
  return Math.max(1, Math.min(MAX_PAGE_BUDGET, Math.floor(v)))
}

function clampTimeBudget(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return DEFAULT_TIME_BUDGET_MS
  return Math.max(1_000, Math.min(MAX_TIME_BUDGET_MS, Math.floor(v)))
}

// Same retry policy as the metadata worker: 4xx (except 429) is
// non-retryable so we don't replay deterministic failures.
function shouldRetryMetaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  const m = message.match(/Meta API (\d{3})/)
  if (!m) return true
  const code = Number.parseInt(m[1]!, 10)
  if (code === 429) return true
  if (code >= 400 && code < 500) return false
  return true
}

type CandidatePost = {
  postId:    string
  mediaId:   string
  mediaType: string | null
  postedAt:  string | null
}

export async function runArchiveMetricsBackfill(
  config: {
    supabaseUrl:  string
    supabaseKey:  string
    accessToken:  string
  },
  options: ArchiveMetricsBackfillOptions = {}
): Promise<ArchiveMetricsBackfillResult> {
  const pageBudget   = clampPageBudget(options.pageBudget)
  const timeBudgetMs = clampTimeBudget(options.timeBudgetMs)
  const dryRun       = options.dryRun === true
  const deadline     = Date.now() + timeBudgetMs

  const supabase: SupabaseClient = createClient<Database>(config.supabaseUrl, config.supabaseKey)

  let cursorRow = await ensureCursorRow(supabase)

  const staleCleared = await clearStaleRunning(supabase)
  if (staleCleared) {
    const refreshed = await loadCursorRow(supabase)
    if (refreshed) cursorRow = refreshed
  }

  if (cursorRow.status === 'complete') {
    return earlyResult({
      cursorRow,
      status:              'complete',
      reachedEndOfBacklog: true,
      stoppedReason:       'end_of_backlog',
      staleCleared,
      dryRun,
    })
  }

  const locked = await acquireLock(supabase, cursorRow.started_at)
  if (!locked) {
    const fresh = (await loadCursorRow(supabase)) ?? cursorRow
    if (fresh.status === 'complete') {
      return earlyResult({
        cursorRow:           fresh,
        status:              'complete',
        reachedEndOfBacklog: true,
        stoppedReason:       'end_of_backlog',
        staleCleared,
        dryRun,
      })
    }
    return earlyResult({
      cursorRow:           fresh,
      status:              'running',
      reachedEndOfBacklog: false,
      stoppedReason:       'already_running',
      staleCleared,
      dryRun,
    })
  }
  cursorRow = locked

  let processedThisRun = 0
  let syncedThisRun    = 0
  let skippedThisRun   = 0
  let errorThisRun     = 0
  let candidatesScanned = 0
  let reachedEndOfBacklog = false
  let stoppedReason: ArchiveMetricsBackfillResult['stoppedReason'] = 'page_budget'
  let lastError: string | null = null
  const classCounts: ArchiveMetricsBackfillResult['classCounts'] = {}

  try {
    // Single eligibility scan per tick. We pull a window large enough
    // to comfortably yield `pageBudget` un-synced candidates, then
    // anti-join `post_metrics_daily` and `post_archive_state` in JS.
    // Oldest-first: the gap is overwhelmingly historical, and recent
    // posts already have metrics from the hourly live sync.
    const candidates = await selectCandidates(supabase, pageBudget)
    candidatesScanned = candidates.length

    if (candidates.length === 0) {
      reachedEndOfBacklog = true
      stoppedReason = 'end_of_backlog'
    }

    for (const candidate of candidates) {
      if (Date.now() >= deadline) {
        stoppedReason = 'time_budget'
        break
      }
      if (processedThisRun >= pageBudget) {
        stoppedReason = 'page_budget'
        break
      }

      // Mark queued before the call so a crash leaves a breadcrumb.
      // Skipped on dryRun — must not mutate state in dry-run mode.
      if (!dryRun) {
        await upsertArchiveState(supabase, candidate.postId, {
          metrics_status: 'queued',
          last_error:     null,
        })
      }

      let outcomeClass: TInsightsErrorClass | 'available' = 'unknown'
      let outcomeError: string | null = null

      try {
        if (dryRun) {
          // Read-only probe: call /insights, classify, do not write.
          const resp = await withBackoff(
            () => fetchMediaInsights(
              candidate.mediaId,
              candidate.mediaType ?? '',
              config.accessToken,
            ),
            { shouldRetry: shouldRetryMetaError },
          )
          outcomeClass = classifyInsightsResponse({ data: resp.data ?? [] })
        } else {
          const result = await withBackoff(
            () => syncInsightsForMedia(
              supabase,
              candidate.postId,
              candidate.mediaId,
              candidate.mediaType ?? '',
              config.accessToken,
            ),
            { shouldRetry: shouldRetryMetaError },
          )
          outcomeClass = result.metricsStored > 0 ? 'available' : 'empty_data'
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const cls = classifyInsightsError(message, candidate.mediaType)
        outcomeClass = cls.class
        outcomeError = cls.detail ?? cls.parsed?.message ?? truncate(message)
      }

      classCounts[outcomeClass] = (classCounts[outcomeClass] ?? 0) + 1
      processedThisRun++

      if (outcomeClass === 'available') {
        syncedThisRun++
        if (!dryRun) {
          await upsertArchiveState(supabase, candidate.postId, {
            metrics_status: 'synced',
            last_error:     null,
          })
        }
      } else if (TERMINAL_CLASSES.has(outcomeClass as TInsightsErrorClass)) {
        skippedThisRun++
        if (!dryRun) {
          await upsertArchiveState(supabase, candidate.postId, {
            metrics_status: 'skipped',
            last_error:     `[${outcomeClass}] ${outcomeError ?? ''}`.trim() || null,
          })
        }
      } else {
        // rate_limit, unknown, network/5xx — retryable.
        errorThisRun++
        lastError = `[${outcomeClass}] ${outcomeError ?? ''}`.trim()
        if (!dryRun) {
          await upsertArchiveState(supabase, candidate.postId, {
            metrics_status: 'error',
            last_error:     lastError,
          })
        }
      }

      // Heartbeat the cursor every 10 posts so a long tick can't go
      // stale and a crash mid-tick advances totals correctly.
      if (processedThisRun % 10 === 0) {
        await heartbeat(supabase, {
          extraSynced:  syncedThisRun,
          extraSkipped: skippedThisRun,
          extraError:   errorThisRun,
          baseRow:      cursorRow,
          lastError,
        })
      }

      // Spacing between Meta calls (covers both dryRun and write paths).
      await sleep(INTER_POST_SLEEP_MS)

      if (processedThisRun >= pageBudget) {
        stoppedReason = 'page_budget'
        break
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    lastError = message
    stoppedReason = 'error'
    await supabase
      .from('ingestion_cursors')
      .update({
        status:      'error',
        last_error:  message,
        error_count: cursorRow.error_count + errorThisRun + 1,
        ran_at:      new Date().toISOString(),
      })
      .eq('job_name', METRICS_JOB_NAME)

    const fresh = await loadCursorRow(supabase)
    return buildResult({
      cursorRow:           fresh ?? cursorRow,
      status:              'error',
      startedThisRun:      true,
      processedThisRun,
      syncedThisRun,
      skippedThisRun,
      errorThisRun,
      staleCleared,
      reachedEndOfBacklog: false,
      stoppedReason:       'error',
      candidatesScanned,
      classCounts,
      dryRun,
    })
  }

  // Final cursor update + status stamp.
  const finalStatus: 'complete' | 'idle' = reachedEndOfBacklog ? 'complete' : 'idle'
  const finishedAt = reachedEndOfBacklog ? new Date().toISOString() : null
  {
    const { error } = await supabase
      .from('ingestion_cursors')
      .update({
        status:         finalStatus,
        finished_at:    finishedAt,
        ran_at:         new Date().toISOString(),
        last_error:     lastError,
        // Reuse fetched_count for "successful syncs", upserted_count for
        // skipped (terminal), error_count for transient. Counters are
        // monotonic across runs.
        fetched_count:  cursorRow.fetched_count  + syncedThisRun,
        upserted_count: cursorRow.upserted_count + skippedThisRun,
        error_count:    cursorRow.error_count    + errorThisRun,
      })
      .eq('job_name', METRICS_JOB_NAME)
    if (error) throw new Error(`ingestion_cursors finalize failed: ${error.message}`)
  }

  const fresh = await loadCursorRow(supabase)
  return buildResult({
    cursorRow:           fresh ?? cursorRow,
    status:              finalStatus,
    startedThisRun:      true,
    processedThisRun,
    syncedThisRun,
    skippedThisRun,
    errorThisRun,
    staleCleared,
    reachedEndOfBacklog,
    stoppedReason,
    candidatesScanned,
    classCounts,
    dryRun,
  })
}

// --------- helpers ---------

async function loadCursorRow(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('ingestion_cursors')
    .select('*')
    .eq('job_name', METRICS_JOB_NAME)
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
    .insert({ job_name: METRICS_JOB_NAME, status: 'idle' })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`ingestion_cursors insert failed: ${error?.message ?? 'unknown'}`)
  }
  return data
}

async function clearStaleRunning(supabase: SupabaseClient): Promise<boolean> {
  const cutoffIso = new Date(Date.now() - STALE_RUNNING_THRESHOLD_MS).toISOString()
  const breadcrumb = `stale lock cleared at ${new Date().toISOString()}`
  const { data, error } = await supabase
    .from('ingestion_cursors')
    .update({
      status:     'error',
      last_error: breadcrumb,
    })
    .eq('job_name', METRICS_JOB_NAME)
    .eq('status', 'running')
    .lt('ran_at', cutoffIso)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`ingestion_cursors stale clear failed: ${error.message}`)
  return !!data
}

async function acquireLock(
  supabase:       SupabaseClient,
  preservedStart: string | null,
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
    .eq('job_name', METRICS_JOB_NAME)
    .in('status', ['idle', 'paused', 'error'])
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`ingestion_cursors lock acquire failed: ${error.message}`)
  return data
}

async function heartbeat(
  supabase: SupabaseClient,
  args: {
    extraSynced:  number
    extraSkipped: number
    extraError:   number
    baseRow:      CursorRow
    lastError:    string | null
  },
): Promise<void> {
  await supabase
    .from('ingestion_cursors')
    .update({
      ran_at:         new Date().toISOString(),
      fetched_count:  args.baseRow.fetched_count  + args.extraSynced,
      upserted_count: args.baseRow.upserted_count + args.extraSkipped,
      error_count:    args.baseRow.error_count    + args.extraError,
      last_error:     args.lastError,
    })
    .eq('job_name', METRICS_JOB_NAME)
}

async function upsertArchiveState(
  supabase: SupabaseClient,
  postId:   string,
  patch: {
    metrics_status: 'queued' | 'synced' | 'skipped' | 'error'
    last_error:     string | null
  },
): Promise<void> {
  const { error } = await supabase
    .from('post_archive_state')
    .upsert(
      {
        post_id:        postId,
        metrics_status: patch.metrics_status,
        last_error:     patch.last_error,
      },
      { onConflict: 'post_id' },
    )
  if (error) throw new Error(`post_archive_state upsert ${postId}: ${error.message}`)
}

// Eligibility selection. Returns up to `pageBudget` posts, oldest
// first, that have NO `post_metrics_daily` row AND whose
// `post_archive_state.metrics_status` is not terminal
// (`synced` / `skipped`). Posts with no archive_state row at all
// are eligible.
async function selectCandidates(
  supabase:   SupabaseClient,
  pageBudget: number,
): Promise<CandidatePost[]> {
  // Pull a generous candidate window. With ~16k missing-metrics posts
  // and pageBudget defaulting to 50, a 5x window is enough to keep
  // selection cheap on every tick. Order by oldest-first because
  // (a) the gap is historical, and (b) recent posts already have
  // metrics from the live sync.
  const candidateLimit = Math.min(pageBudget * 5, 1000)
  const { data: posts, error: postsErr } = await supabase
    .from('posts')
    .select('id, media_id, media_type, posted_at')
    .order('posted_at', { ascending: true, nullsFirst: false })
    .limit(candidateLimit)
  if (postsErr) throw new Error(`posts select: ${postsErr.message}`)
  if (!posts || posts.length === 0) return []

  const ids = posts.map((p) => p.id)

  const haveMetrics  = await chunkedIdSet(ids, async (chunk) => {
    const { data, error } = await supabase
      .from('post_metrics_daily')
      .select('post_id')
      .in('post_id', chunk)
    if (error) throw new Error(`post_metrics_daily lookup: ${error.message}`)
    return (data ?? []).map((r) => r.post_id).filter((v): v is string => typeof v === 'string')
  })

  const terminalStateIds = await chunkedIdSet(ids, async (chunk) => {
    const { data, error } = await supabase
      .from('post_archive_state')
      .select('post_id, metrics_status')
      .in('post_id', chunk)
      .in('metrics_status', ['synced', 'skipped'])
    if (error) throw new Error(`post_archive_state lookup: ${error.message}`)
    return (data ?? []).map((r) => r.post_id)
  })

  const filtered: CandidatePost[] = []
  for (const p of posts) {
    if (haveMetrics.has(p.id)) continue
    if (terminalStateIds.has(p.id)) continue
    filtered.push({
      postId:    p.id,
      mediaId:   p.media_id,
      mediaType: p.media_type ?? null,
      postedAt:  p.posted_at,
    })
    if (filtered.length >= pageBudget) break
  }

  return filtered
}

async function chunkedIdSet(
  ids:    string[],
  fetch:  (chunk: string[]) => Promise<string[]>,
): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < ids.length; i += ID_LOOKUP_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + ID_LOOKUP_CHUNK_SIZE)
    const found = await fetch(chunk)
    for (const id of found) out.add(id)
  }
  return out
}

function truncate(s: string): string {
  return s.length > 240 ? `${s.slice(0, 240)}…` : s
}

function earlyResult(args: {
  cursorRow:           CursorRow
  status:              ArchiveMetricsBackfillResult['status']
  reachedEndOfBacklog: boolean
  stoppedReason:       ArchiveMetricsBackfillResult['stoppedReason']
  staleCleared:        boolean
  dryRun:              boolean
}): ArchiveMetricsBackfillResult {
  return buildResult({
    cursorRow:           args.cursorRow,
    status:              args.status,
    startedThisRun:      false,
    processedThisRun:    0,
    syncedThisRun:       0,
    skippedThisRun:      0,
    errorThisRun:        0,
    staleCleared:        args.staleCleared,
    reachedEndOfBacklog: args.reachedEndOfBacklog,
    stoppedReason:       args.stoppedReason,
    candidatesScanned:   0,
    classCounts:         {},
    dryRun:              args.dryRun,
  })
}

function buildResult(args: {
  cursorRow:           CursorRow
  status:              ArchiveMetricsBackfillResult['status']
  startedThisRun:      boolean
  processedThisRun:    number
  syncedThisRun:       number
  skippedThisRun:      number
  errorThisRun:        number
  staleCleared:        boolean
  reachedEndOfBacklog: boolean
  stoppedReason:       ArchiveMetricsBackfillResult['stoppedReason']
  candidatesScanned:   number
  classCounts:         ArchiveMetricsBackfillResult['classCounts']
  dryRun:              boolean
}): ArchiveMetricsBackfillResult {
  return {
    jobName:           METRICS_JOB_NAME,
    status:            args.status,
    startedThisRun:    args.startedThisRun,
    dryRun:            args.dryRun,
    processedThisRun:  args.processedThisRun,
    syncedThisRun:     args.syncedThisRun,
    skippedThisRun:    args.skippedThisRun,
    errorThisRun:      args.errorThisRun,
    staleCleared:      args.staleCleared,
    totals: {
      fetchedCount:  args.cursorRow.fetched_count,
      upsertedCount: args.cursorRow.upserted_count,
      skippedCount:  args.cursorRow.skipped_count,
      errorCount:    args.cursorRow.error_count,
    },
    candidatesScanned:   args.candidatesScanned,
    reachedEndOfBacklog: args.reachedEndOfBacklog,
    stoppedReason:       args.stoppedReason,
    classCounts:         args.classCounts,
  }
}
