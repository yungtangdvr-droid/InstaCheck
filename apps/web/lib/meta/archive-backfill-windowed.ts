import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import { fetchMediaPageWindowed } from './instagram-client'
import { sleep, withBackoff } from './rate-limit'
import {
  upsertMediaAndPost,
  type IGMediaItem,
  type SupabaseClient,
} from './archive-backfill'

// Date-windowed archive metadata backfill. Walks `/me/media?since=&until=`
// one monthly window at a time, using a per-window row in
// `ingestion_cursors` (job_name = `${JOB_PREFIX}:<label>`). Designed to
// recover the ~17k pre-2022-03-21 media that the legacy deep-cursor
// worker (`archive-backfill.ts`, job `meta.media.archive_backfill`)
// could not reach because of Meta error code 1.
//
// Strict separation from the legacy job:
//   - Never reads or writes the `meta.media.archive_backfill` cursor row.
//   - Reuses `upsertMediaAndPost` (exported from archive-backfill.ts)
//     for byte-identical write semantics, but tracks its own counters.
//   - Lives behind its own endpoint (`/api/meta/archive/backfill-windowed`)
//     and its own automation_runs name.
//
// Manifest:
//   - Hard floor: contiguous monthly windows from 2022-03 backwards to
//     2015-01 inclusive, newest-first.
//   - No empty-streak heuristic. The worker only stops when every
//     manifest window has reached terminal state (`complete` or
//     `error`).
//   - An errored window is NOT auto-retried; the operator must flip
//     its row back to `idle` to retry it.

export const JOB_PREFIX = 'meta.media.archive_backfill_windowed'

export const DEFAULT_PAGE_BUDGET    = 1
export const MAX_PAGE_BUDGET        = 10
export const DEFAULT_TIME_BUDGET_MS = 60_000
export const MAX_TIME_BUDGET_MS     = 90_000
export const DEFAULT_LIMIT          = 50
export const MAX_LIMIT              = 100

// Mirrors the legacy worker. Sized well above MAX_TIME_BUDGET_MS and
// route maxDuration so a healthy long-running call is never falsely
// classified as stale.
export const STALE_RUNNING_THRESHOLD_MS = 5 * 60_000

const INTER_PAGE_SLEEP_MS = 250
const RECENT_FAILURES_CAP = 25

// Manifest bounds. Inclusive on both ends. Months count down from
// MANIFEST_START to MANIFEST_END.
const MANIFEST_START_YEAR  = 2022
const MANIFEST_START_MONTH = 3
const MANIFEST_END_YEAR    = 2015
const MANIFEST_END_MONTH   = 1

// `YYYY-MM-DD..YYYY-MM-DD`
const WINDOW_LABEL_RE = /^(\d{4})-(\d{2})-(\d{2})\.\.(\d{4})-(\d{2})-(\d{2})$/

export type WindowedBackfillOptions = {
  pageBudget?:   number
  timeBudgetMs?: number
  limit?:        number
  pinnedWindow?: string
}

export type WindowedStoppedReason =
  | 'page_budget'
  | 'time_budget'
  | 'window_complete'
  | 'meta_code_1'
  | 'already_running'
  | 'manifest_exhausted'
  | 'invalid_window'
  | 'error'

export type WindowedBackfillResult = {
  selectedWindow: string | null
  pagesThisRun:   number
  fetchedThisRun: number
  upsertedThisRun: number
  duplicateOrUpdatedThisRun: number
  skippedThisRun: number
  errorThisRun:   boolean
  stoppedReason:  WindowedStoppedReason
  cursor:         string | null
  windowComplete: boolean
  staleCleared:   boolean
  totals: {
    fetchedCount:  number
    upsertedCount: number
    skippedCount:  number
    errorCount:    number
  }
  manifestSummary: ManifestSummary
  lastError:      string | null
}

type ManifestSummary = {
  totalWindows: number
  completed:    number
  errored:      number
  pending:      number
}

type WindowSpec = {
  label:    string
  sinceIso: string
  untilIso: string
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

// Last day of (year, month) where month is 1-based.
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function buildWindowSpec(year: number, month: number): WindowSpec {
  const lastDay  = lastDayOfMonth(year, month)
  const startStr = `${year}-${pad2(month)}-01`
  const endStr   = `${year}-${pad2(month)}-${pad2(lastDay)}`
  return {
    label:    `${startStr}..${endStr}`,
    sinceIso: `${startStr}T00:00:00Z`,
    untilIso: `${endStr}T23:59:59Z`,
  }
}

export function buildManifest(): WindowSpec[] {
  const out: WindowSpec[] = []
  let y = MANIFEST_START_YEAR
  let m = MANIFEST_START_MONTH
  // Iterate backwards until we pass the manifest end.
  for (;;) {
    out.push(buildWindowSpec(y, m))
    if (y === MANIFEST_END_YEAR && m === MANIFEST_END_MONTH) break
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
    if (y < MANIFEST_END_YEAR) break // safety net; should never trigger
  }
  return out
}

function parseWindowLabel(label: string): WindowSpec | null {
  const m = WINDOW_LABEL_RE.exec(label)
  if (!m) return null
  const sinceIso = `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`
  const untilIso = `${m[4]}-${m[5]}-${m[6]}T23:59:59Z`
  if (Number.isNaN(Date.parse(sinceIso)) || Number.isNaN(Date.parse(untilIso))) {
    return null
  }
  if (Date.parse(sinceIso) > Date.parse(untilIso)) return null
  return { label, sinceIso, untilIso }
}

function isoToUnixSeconds(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000)
}

function clampPageBudget(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return DEFAULT_PAGE_BUDGET
  return Math.max(1, Math.min(MAX_PAGE_BUDGET, Math.floor(v)))
}

function clampTimeBudget(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return DEFAULT_TIME_BUDGET_MS
  return Math.max(1_000, Math.min(MAX_TIME_BUDGET_MS, Math.floor(v)))
}

function clampLimit(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(v)))
}

// Same retry policy as the legacy worker: 4xx (except 429) is
// non-retryable. Network and 5xx fall through to default backoff.
// Meta error code 1 ("reduce the amount of data") returns HTTP 400, so
// it short-circuits here and surfaces synchronously to the run loop,
// which then marks the window errored.
function shouldRetryMetaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  const m = message.match(/Meta API (\d{3})/)
  if (!m) return true
  const code = Number.parseInt(m[1]!, 10)
  if (code === 429) return true
  if (code >= 400 && code < 500) return false
  return true
}

function isMetaCode1(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  // Body shape:
  //   Meta API 400: {"error":{"message":"...","type":"...","code":1,...}}
  // Match the JSON-encoded code key explicitly to avoid coincidental
  // "1" matches inside other parts of the message.
  return /Meta API 400/.test(message) && /"code"\s*:\s*1\b/.test(message)
}

type CursorRow = Database['public']['Tables']['ingestion_cursors']['Row']

type RecentFailure = {
  media_id: string | null
  ts:       string
  message:  string
}

type WindowPayload = {
  since_iso?:        string
  until_iso?:        string
  label?:            string
  recent_failures?:  RecentFailure[]
}

function readPayload(row: CursorRow): WindowPayload {
  const raw = row.payload as unknown
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as WindowPayload
  }
  return {}
}

function appendRecentFailure(
  payload: WindowPayload,
  entry:   RecentFailure
): WindowPayload {
  const existing = Array.isArray(payload.recent_failures) ? payload.recent_failures : []
  const next = [...existing, entry]
  if (next.length > RECENT_FAILURES_CAP) next.splice(0, next.length - RECENT_FAILURES_CAP)
  return { ...payload, recent_failures: next }
}

export async function runWindowedArchiveBackfill(
  config: {
    supabaseUrl: string
    supabaseKey: string
    igUserId:    string
    accessToken: string
  },
  options: WindowedBackfillOptions = {}
): Promise<WindowedBackfillResult> {
  const pageBudget   = clampPageBudget(options.pageBudget)
  const timeBudgetMs = clampTimeBudget(options.timeBudgetMs)
  const limit        = clampLimit(options.limit)
  const deadline     = Date.now() + timeBudgetMs

  const supabase = createClient<Database>(config.supabaseUrl, config.supabaseKey)

  // Resolve account_id (mirrors legacy worker). Archive cannot run
  // until the live sync has populated `accounts` for this IG user.
  const { data: accountRow, error: accountErr } = await supabase
    .from('accounts')
    .select('id')
    .eq('instagram_id', config.igUserId)
    .maybeSingle()
  if (accountErr) throw new Error(`accounts lookup failed: ${accountErr.message}`)
  if (!accountRow) {
    throw new Error(
      `no accounts row for instagram_id=${config.igUserId} — run /api/meta/sync first`
    )
  }
  const accountRowId = accountRow.id

  const manifest = buildManifest()
  const allRows  = await loadAllWindowedRows(supabase)
  const summary  = summarizeManifest(manifest, allRows)

  const baseEarly = (
    args: {
      selectedWindow: string | null
      stoppedReason:  WindowedStoppedReason
      staleCleared:   boolean
    }
  ): WindowedBackfillResult => ({
    selectedWindow: args.selectedWindow,
    pagesThisRun:   0,
    fetchedThisRun: 0,
    upsertedThisRun: 0,
    duplicateOrUpdatedThisRun: 0,
    skippedThisRun: 0,
    errorThisRun:   false,
    stoppedReason:  args.stoppedReason,
    cursor:         null,
    windowComplete: false,
    staleCleared:   args.staleCleared,
    totals: { fetchedCount: 0, upsertedCount: 0, skippedCount: 0, errorCount: 0 },
    manifestSummary: summary,
    lastError:      null,
  })

  // Pick the target window. Pinned wins; otherwise walk the manifest.
  let target: WindowSpec | null
  let pinned = false
  if (options.pinnedWindow) {
    const parsed = parseWindowLabel(options.pinnedWindow)
    if (!parsed) {
      return baseEarly({
        selectedWindow: options.pinnedWindow,
        stoppedReason:  'invalid_window',
        staleCleared:   false,
      })
    }
    target = parsed
    pinned = true
  } else {
    target = pickNextWindow(manifest, allRows)
    if (!target) {
      return baseEarly({
        selectedWindow: null,
        stoppedReason:  'manifest_exhausted',
        staleCleared:   false,
      })
    }
  }

  // Ensure the cursor row exists and stale-recover this specific row.
  let cursorRow = await ensureCursorRow(supabase, target)
  const staleCleared = await clearStaleRunning(supabase, target.label)
  if (staleCleared) {
    const refreshed = await loadCursorRow(supabase, target.label)
    if (refreshed) cursorRow = refreshed
  }

  // Short-circuit on terminal states so scheduled ticks against an
  // already-finished window don't churn the row.
  if (cursorRow.status === 'complete') {
    return finalizeEarly({
      summary,
      cursorRow,
      stoppedReason:  pinned ? 'window_complete' : 'manifest_exhausted',
      staleCleared,
      windowComplete: true,
    })
  }
  if (cursorRow.status === 'error') {
    // Only reachable when pinned to an errored window. Manifest
    // selection already excludes errored rows.
    return finalizeEarly({
      summary,
      cursorRow,
      stoppedReason:  'error',
      staleCleared,
      windowComplete: false,
    })
  }

  const locked = await acquireLock(supabase, target.label, cursorRow.started_at)
  if (!locked) {
    const fresh = (await loadCursorRow(supabase, target.label)) ?? cursorRow
    if (fresh.status === 'complete') {
      return finalizeEarly({
        summary,
        cursorRow:      fresh,
        stoppedReason:  pinned ? 'window_complete' : 'manifest_exhausted',
        staleCleared,
        windowComplete: true,
      })
    }
    return finalizeEarly({
      summary,
      cursorRow:      fresh,
      stoppedReason:  'already_running',
      staleCleared,
      windowComplete: false,
    })
  }
  cursorRow = locked

  let pagesThisRun = 0
  let fetchedThisRun = 0
  let upsertedThisRun = 0
  let duplicateOrUpdatedThisRun = 0
  let skippedThisRun = 0
  let errorThisRun = false
  let lastError: string | null = null

  let after: string | undefined = cursorRow.cursor ?? undefined
  let payload = readPayload(cursorRow)
  // Stamp window identity into the payload on first acquire.
  if (!payload.label) {
    payload = {
      ...payload,
      label:     target.label,
      since_iso: target.sinceIso,
      until_iso: target.untilIso,
    }
  }

  let windowComplete = false
  let stoppedReason: WindowedStoppedReason = 'page_budget'

  const sinceSec = isoToUnixSeconds(target.sinceIso)
  const untilSec = isoToUnixSeconds(target.untilIso)

  try {
    for (let i = 0; i < pageBudget; i++) {
      if (Date.now() >= deadline) {
        stoppedReason = 'time_budget'
        break
      }

      let page: Awaited<ReturnType<typeof fetchMediaPageWindowed>>
      try {
        page = await withBackoff(
          () => fetchMediaPageWindowed(config.igUserId, config.accessToken, {
            sinceSec,
            untilSec,
            after,
            limit,
          }),
          { shouldRetry: shouldRetryMetaError }
        )
      } catch (err) {
        if (isMetaCode1(err)) {
          // Mark this window errored and stop. Operator can subdivide
          // by inserting finer rows directly into ingestion_cursors.
          errorThisRun = true
          lastError    = err instanceof Error ? err.message : String(err)
          stoppedReason = 'meta_code_1'
          await markWindowErrored(supabase, target.label, lastError, payload)
          break
        }
        throw err
      }

      pagesThisRun += 1
      const items = page.data ?? []
      fetchedThisRun += items.length

      // Pre-fetch which media_ids are already in `posts` so we can
      // distinguish "newly inserted" from "already-present (updated)"
      // without changing upsertMediaAndPost's return type.
      const existingIds = await fetchExistingMediaIds(
        supabase,
        items.map((it) => it.id)
      )

      for (const media of items) {
        const wasExisting = existingIds.has(media.id)
        try {
          await upsertMediaAndPost(
            supabase,
            media as IGMediaItem,
            config.igUserId,
            accountRowId
          )
          if (wasExisting) {
            duplicateOrUpdatedThisRun += 1
          } else {
            upsertedThisRun += 1
          }
        } catch (err) {
          errorThisRun = true
          const msg = err instanceof Error ? err.message : String(err)
          lastError = msg
          skippedThisRun += 1
          payload = appendRecentFailure(payload, {
            media_id: media.id ?? null,
            ts:       new Date().toISOString(),
            message:  msg.length > 600 ? `${msg.slice(0, 600)}…` : msg,
          })
        }
      }

      const nextAfter   = page.paging?.cursors?.after
      const hasNextPage = Boolean(page.paging?.next)

      const { error: updErr } = await supabase
        .from('ingestion_cursors')
        .update({
          cursor:         nextAfter ?? null,
          fetched_count:  cursorRow.fetched_count  + fetchedThisRun,
          upserted_count: cursorRow.upserted_count + upsertedThisRun + duplicateOrUpdatedThisRun,
          skipped_count:  cursorRow.skipped_count  + skippedThisRun,
          error_count:    cursorRow.error_count    + (errorThisRun ? 1 : 0),
          ran_at:         new Date().toISOString(),
          last_error:     lastError,
          payload:        payload as unknown as Database['public']['Tables']['ingestion_cursors']['Update']['payload'],
        })
        .eq('job_name', target.label)
      if (updErr) throw new Error(`ingestion_cursors update failed: ${updErr.message}`)

      after = nextAfter

      if (!hasNextPage || !nextAfter) {
        windowComplete = true
        stoppedReason  = 'window_complete'
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
    lastError    = err instanceof Error ? err.message : String(err)
    stoppedReason = 'error'
    await supabase
      .from('ingestion_cursors')
      .update({
        status:      'error',
        last_error:  lastError,
        error_count: cursorRow.error_count + 1,
        ran_at:      new Date().toISOString(),
        payload:     payload as unknown as Database['public']['Tables']['ingestion_cursors']['Update']['payload'],
      })
      .eq('job_name', target.label)

    const fresh = await loadCursorRow(supabase, target.label)
    return buildResult({
      cursorRow:      fresh ?? cursorRow,
      target,
      pagesThisRun,
      fetchedThisRun,
      upsertedThisRun,
      duplicateOrUpdatedThisRun,
      skippedThisRun,
      errorThisRun:   true,
      stoppedReason:  'error',
      windowComplete: false,
      staleCleared,
      manifestSummary: await refreshManifestSummary(supabase, manifest),
      lastError,
    })
  }

  // Final status. `meta_code_1` was already persisted by markWindowErrored.
  if (stoppedReason !== 'meta_code_1') {
    const finalStatus: 'complete' | 'idle' = windowComplete ? 'complete' : 'idle'
    const finishedAt = windowComplete ? new Date().toISOString() : null
    const { error } = await supabase
      .from('ingestion_cursors')
      .update({
        status:      finalStatus,
        finished_at: finishedAt,
        ran_at:      new Date().toISOString(),
      })
      .eq('job_name', target.label)
    if (error) throw new Error(`ingestion_cursors finalize failed: ${error.message}`)
  }

  const fresh = await loadCursorRow(supabase, target.label)
  return buildResult({
    cursorRow:      fresh ?? cursorRow,
    target,
    pagesThisRun,
    fetchedThisRun,
    upsertedThisRun,
    duplicateOrUpdatedThisRun,
    skippedThisRun,
    errorThisRun,
    stoppedReason,
    windowComplete,
    staleCleared,
    manifestSummary: await refreshManifestSummary(supabase, manifest),
    lastError,
  })
}

function finalizeEarly(args: {
  summary:        ManifestSummary
  cursorRow:      CursorRow
  stoppedReason:  WindowedStoppedReason
  staleCleared:   boolean
  windowComplete: boolean
}): WindowedBackfillResult {
  return {
    selectedWindow: args.cursorRow.job_name.startsWith(`${JOB_PREFIX}:`)
      ? args.cursorRow.job_name.slice(JOB_PREFIX.length + 1)
      : null,
    pagesThisRun:   0,
    fetchedThisRun: 0,
    upsertedThisRun: 0,
    duplicateOrUpdatedThisRun: 0,
    skippedThisRun: 0,
    errorThisRun:   false,
    stoppedReason:  args.stoppedReason,
    cursor:         args.cursorRow.cursor,
    windowComplete: args.windowComplete,
    staleCleared:   args.staleCleared,
    totals: {
      fetchedCount:  args.cursorRow.fetched_count,
      upsertedCount: args.cursorRow.upserted_count,
      skippedCount:  args.cursorRow.skipped_count,
      errorCount:    args.cursorRow.error_count,
    },
    manifestSummary: args.summary,
    lastError:       args.cursorRow.last_error,
  }
}

function buildResult(args: {
  cursorRow:                 CursorRow
  target:                    WindowSpec
  pagesThisRun:              number
  fetchedThisRun:            number
  upsertedThisRun:           number
  duplicateOrUpdatedThisRun: number
  skippedThisRun:            number
  errorThisRun:              boolean
  stoppedReason:             WindowedStoppedReason
  windowComplete:            boolean
  staleCleared:              boolean
  manifestSummary:           ManifestSummary
  lastError:                 string | null
}): WindowedBackfillResult {
  return {
    selectedWindow: args.target.label,
    pagesThisRun:   args.pagesThisRun,
    fetchedThisRun: args.fetchedThisRun,
    upsertedThisRun: args.upsertedThisRun,
    duplicateOrUpdatedThisRun: args.duplicateOrUpdatedThisRun,
    skippedThisRun: args.skippedThisRun,
    errorThisRun:   args.errorThisRun,
    stoppedReason:  args.stoppedReason,
    cursor:         args.cursorRow.cursor,
    windowComplete: args.windowComplete,
    staleCleared:   args.staleCleared,
    totals: {
      fetchedCount:  args.cursorRow.fetched_count,
      upsertedCount: args.cursorRow.upserted_count,
      skippedCount:  args.cursorRow.skipped_count,
      errorCount:    args.cursorRow.error_count,
    },
    manifestSummary: args.manifestSummary,
    lastError:       args.lastError,
  }
}

async function loadCursorRow(
  supabase: SupabaseClient,
  label:    string
): Promise<CursorRow | null> {
  const jobName = `${JOB_PREFIX}:${label}`
  const { data, error } = await supabase
    .from('ingestion_cursors')
    .select('*')
    .eq('job_name', jobName)
    .maybeSingle()
  if (error) throw new Error(`ingestion_cursors load failed: ${error.message}`)
  return data
}

async function ensureCursorRow(
  supabase: SupabaseClient,
  target:   WindowSpec
): Promise<CursorRow> {
  const existing = await loadCursorRow(supabase, target.label)
  if (existing) return existing
  const jobName = `${JOB_PREFIX}:${target.label}`
  const { data, error } = await supabase
    .from('ingestion_cursors')
    .insert({
      job_name: jobName,
      status:   'idle',
      payload:  {
        label:     target.label,
        since_iso: target.sinceIso,
        until_iso: target.untilIso,
      } as unknown as Database['public']['Tables']['ingestion_cursors']['Insert']['payload'],
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`ingestion_cursors insert failed: ${error?.message ?? 'unknown'}`)
  }
  return data
}

async function loadAllWindowedRows(supabase: SupabaseClient): Promise<CursorRow[]> {
  const { data, error } = await supabase
    .from('ingestion_cursors')
    .select('*')
    .like('job_name', `${JOB_PREFIX}:%`)
  if (error) throw new Error(`ingestion_cursors list failed: ${error.message}`)
  return data ?? []
}

function rowsByLabel(rows: CursorRow[]): Map<string, CursorRow> {
  const map = new Map<string, CursorRow>()
  for (const r of rows) {
    if (r.job_name.startsWith(`${JOB_PREFIX}:`)) {
      map.set(r.job_name.slice(JOB_PREFIX.length + 1), r)
    }
  }
  return map
}

// Pick first manifest window whose row is missing OR not in a terminal
// state. Terminal here means `complete` or `error` — manager decision:
// errored windows are not auto-retried.
function pickNextWindow(
  manifest: WindowSpec[],
  rows:     CursorRow[]
): WindowSpec | null {
  const map = rowsByLabel(rows)
  for (const w of manifest) {
    const row = map.get(w.label)
    if (!row) return w
    if (row.status === 'complete' || row.status === 'error') continue
    return w
  }
  return null
}

function summarizeManifest(
  manifest: WindowSpec[],
  rows:     CursorRow[]
): ManifestSummary {
  const map = rowsByLabel(rows)
  let completed = 0
  let errored   = 0
  let pending   = 0
  for (const w of manifest) {
    const row = map.get(w.label)
    if (!row) {
      pending += 1
    } else if (row.status === 'complete') {
      completed += 1
    } else if (row.status === 'error') {
      errored += 1
    } else {
      pending += 1
    }
  }
  return { totalWindows: manifest.length, completed, errored, pending }
}

async function refreshManifestSummary(
  supabase: SupabaseClient,
  manifest: WindowSpec[]
): Promise<ManifestSummary> {
  const rows = await loadAllWindowedRows(supabase)
  return summarizeManifest(manifest, rows)
}

// Force-release a dead lock for a specific window. Mirrors the legacy
// worker's stale-clear policy but scoped to one job_name.
async function clearStaleRunning(
  supabase: SupabaseClient,
  label:    string
): Promise<boolean> {
  const cutoffIso  = new Date(Date.now() - STALE_RUNNING_THRESHOLD_MS).toISOString()
  const breadcrumb = `stale lock cleared at ${new Date().toISOString()}`
  const jobName    = `${JOB_PREFIX}:${label}`
  const { data, error } = await supabase
    .from('ingestion_cursors')
    .update({
      status:     'error',
      last_error: breadcrumb,
    })
    .eq('job_name', jobName)
    .eq('status', 'running')
    .lt('ran_at', cutoffIso)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`ingestion_cursors stale clear failed: ${error.message}`)
  return !!data
}

// Atomic lock acquire. Excludes `error` from the auto-acquire set so
// that errored windows stay out of rotation until an operator flips
// them back to `idle` manually.
async function acquireLock(
  supabase:       SupabaseClient,
  label:          string,
  preservedStart: string | null
): Promise<CursorRow | null> {
  const nowIso  = new Date().toISOString()
  const jobName = `${JOB_PREFIX}:${label}`
  const { data, error } = await supabase
    .from('ingestion_cursors')
    .update({
      status:     'running',
      ran_at:     nowIso,
      started_at: preservedStart ?? nowIso,
      last_error: null,
    })
    .eq('job_name', jobName)
    .in('status', ['idle', 'paused'])
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`ingestion_cursors lock acquire failed: ${error.message}`)
  return data
}

async function markWindowErrored(
  supabase: SupabaseClient,
  label:    string,
  message:  string,
  payload:  WindowPayload
): Promise<void> {
  const jobName = `${JOB_PREFIX}:${label}`
  await supabase
    .from('ingestion_cursors')
    .update({
      status:      'error',
      last_error:  message,
      ran_at:      new Date().toISOString(),
      payload:     payload as unknown as Database['public']['Tables']['ingestion_cursors']['Update']['payload'],
    })
    .eq('job_name', jobName)
}

async function fetchExistingMediaIds(
  supabase: SupabaseClient,
  ids:      string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data, error } = await supabase
    .from('posts')
    .select('media_id')
    .in('media_id', ids)
  if (error) throw new Error(`posts existence lookup failed: ${error.message}`)
  const out = new Set<string>()
  for (const r of data ?? []) {
    if (typeof r.media_id === 'string') out.add(r.media_id)
  }
  return out
}
