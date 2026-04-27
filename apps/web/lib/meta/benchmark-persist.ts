// Benchmark persistence — local CLI only (PR 3).
//
// Pure layer: takes an injected SupabaseClient<Database>, the
// detailed probe result, and the validated CLI args; writes the
// four benchmark tables. No Meta I/O happens here — the probe
// has already been called by the CLI when this layer runs.
//
// Doctrine recap:
//   - Only `--persist` causes any DB write. Dry-run never reaches
//     this module.
//   - On a first-time username, `--cohort` is required; the CLI
//     enforces this BEFORE creating the benchmark_sync_runs row,
//     so this module trusts that args.cohort is present whenever
//     args.isFirstTime is true.
//   - Cohort is immutable from the CLI for an existing account.
//   - reposts is persisted as null on raw_benchmark_instagram_media:
//     the probe only checks availability, never reads a per-media
//     value.
//   - metric_availability is split per-table (account-only on the
//     daily row, media-only on the media row).
//   - All raw_json / raw_response_excerpt / errors[].body go through
//     scrubAccessToken before being written.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  TBenchmarkCohort,
  TBenchmarkPersistResult,
  TBenchmarkProbeError,
  TBenchmarkSyncRunStatus,
} from '@creator-hub/types'
import type { Database, Json } from '@creator-hub/types/supabase'

import type { BenchmarkProbeDetailed } from './benchmark-probe'
import { scrubAccessToken } from './benchmark-sanitize'

const SYNC_RUN_KIND = 'probe_cli'

export type PersistError = {
  where:    string
  message:  string
  status?:  number
  body?:    unknown
}

export type PreflightArgs = {
  supabase:    SupabaseClient<Database>
  igUsername:  string
}

export type PreflightResult =
  | { ok: true;  exists: false }
  | { ok: true;  exists: true;  accountId: string; cohort: TBenchmarkCohort }
  | { ok: false; error: PersistError }

/**
 * Look up an existing benchmark_accounts row by ig_username.
 * The CLI uses the result to enforce `--cohort` requirements
 * BEFORE any Meta call or run-row insert.
 */
export async function preflightAccount(
  args: PreflightArgs
): Promise<PreflightResult> {
  const { data, error } = await args.supabase
    .from('benchmark_accounts')
    .select('id, cohort')
    .eq('ig_username', args.igUsername)
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      error: {
        where:   'preflight_account',
        message: error.message,
      },
    }
  }
  if (!data) return { ok: true, exists: false }
  return {
    ok:        true,
    exists:    true,
    accountId: data.id,
    cohort:    data.cohort,
  }
}

export type OpenSyncRunArgs = {
  supabase: SupabaseClient<Database>
}

export type OpenSyncRunResult =
  | { ok: true;  runId: string }
  | { ok: false; error: PersistError }

export async function openSyncRun(
  args: OpenSyncRunArgs
): Promise<OpenSyncRunResult> {
  const { data, error } = await args.supabase
    .from('benchmark_sync_runs')
    .insert({
      status:             'running',
      kind:               SYNC_RUN_KIND,
      accounts_attempted: 1,
    })
    .select('id')
    .single()

  if (error || !data) {
    return {
      ok: false,
      error: {
        where:   'open_sync_run',
        message: error?.message ?? 'no row returned from insert',
      },
    }
  }
  return { ok: true, runId: data.id }
}

export type CloseSyncRunArgs = {
  supabase:           SupabaseClient<Database>
  runId:              string
  status:             TBenchmarkSyncRunStatus
  accountsSucceeded:  number
  mediaFetched:       number
  errors:             PersistError[]
  fetchedVia:         string | null
  notes:              string | null
}

export async function closeSyncRun(args: CloseSyncRunArgs): Promise<void> {
  // Sanitize errors before persistence — the body might echo a
  // request URL with access_token=... in it.
  const sanitizedErrors = args.errors.map((e) => ({
    where:   e.where,
    message: e.message,
    ...(e.status !== undefined ? { status: e.status } : {}),
    ...(e.body  !== undefined ? { body: scrubAccessToken(e.body) } : {}),
  }))

  await args.supabase
    .from('benchmark_sync_runs')
    .update({
      status:             args.status,
      finished_at:        new Date().toISOString(),
      accounts_succeeded: args.accountsSucceeded,
      media_fetched:      args.mediaFetched,
      errors:             sanitizedErrors as unknown as Json,
      fetched_via:        args.fetchedVia,
      notes:              args.notes,
    })
    .eq('id', args.runId)
}

export type InsertAccountArgs = {
  supabase:    SupabaseClient<Database>
  igUsername:  string
  igUserId:    string | null
  cohort:      TBenchmarkCohort
}

export type InsertAccountResult =
  | { ok: true;  accountId: string }
  | { ok: false; error: PersistError }

export async function insertNewAccount(
  args: InsertAccountArgs
): Promise<InsertAccountResult> {
  const { data, error } = await args.supabase
    .from('benchmark_accounts')
    .insert({
      ig_username: args.igUsername,
      ig_user_id:  args.igUserId,
      cohort:      args.cohort,
      active:      true,
    })
    .select('id')
    .single()

  if (error || !data) {
    return {
      ok: false,
      error: {
        where:   'insert_benchmark_account',
        message: error?.message ?? 'no row returned from insert',
      },
    }
  }
  return { ok: true, accountId: data.id }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function numericIfAvailable(value: unknown, available: boolean): number | null {
  if (!available) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

export type WriteAccountDailyArgs = {
  supabase:           SupabaseClient<Database>
  benchmarkAccountId: string
  detailed:           BenchmarkProbeDetailed
  todayUtcDate?:      string
}

export type WriteAccountDailyResult =
  | { ok: true }
  | { ok: false; error: PersistError }

export async function writeAccountDaily(
  args: WriteAccountDailyArgs
): Promise<WriteAccountDailyResult> {
  const { detailed } = args
  const account = detailed.account
  const accountFields = detailed.report.account_fields

  const followers = numericIfAvailable(
    account?.followers_count,
    accountFields.followers_count === 'available'
  )
  const mediaCount = numericIfAvailable(
    account?.media_count,
    accountFields.media_count === 'available'
  )

  // metric_availability for THIS table = account-level keys only.
  const metricAvailability = {
    followers_count: accountFields.followers_count,
    media_count:     accountFields.media_count,
  }

  const sanitizedAccountJson = scrubAccessToken(account ?? {}) as Json

  const { error } = await args.supabase
    .from('raw_benchmark_instagram_account_daily')
    .upsert(
      {
        benchmark_account_id: args.benchmarkAccountId,
        date:                 args.todayUtcDate ?? todayUtc(),
        followers_count:      followers,
        media_count:          mediaCount,
        metric_availability:  metricAvailability as unknown as Json,
        fetched_via:          'business_discovery',
        raw_json:             sanitizedAccountJson,
      },
      { onConflict: 'benchmark_account_id,date' }
    )

  if (error) {
    return {
      ok: false,
      error: {
        where:   'upsert_account_daily',
        message: error.message,
      },
    }
  }
  return { ok: true }
}

export type WriteMediaArgs = {
  supabase:           SupabaseClient<Database>
  benchmarkAccountId: string
  detailed:           BenchmarkProbeDetailed
}

export type WriteMediaResult = {
  written:   number
  attempted: number
  errors:    PersistError[]
}

export async function writeMediaRows(
  args: WriteMediaArgs
): Promise<WriteMediaResult> {
  const list = args.detailed.media
  const mf = args.detailed.report.media_fields
  const errors: PersistError[] = []
  let written = 0

  // metric_availability for THIS table = media-level keys only.
  const mediaAvailability = {
    like_count:     mf.like_count,
    comments_count: mf.comments_count,
    view_count:     mf.view_count,
    reposts:        mf.reposts,
  }

  for (const media of list) {
    if (!media || typeof media.id !== 'string' || media.id.length === 0) {
      errors.push({
        where:   'upsert_media',
        message: 'skipped media item without id',
      })
      continue
    }

    const likeCount     = numericIfAvailable(media.like_count,     mf.like_count     === 'available')
    const commentsCount = numericIfAvailable(media.comments_count, mf.comments_count === 'available')
    const viewCount     = numericIfAvailable(media.view_count,     mf.view_count     === 'available')

    let postedAt: string | null = null
    if (typeof media.timestamp === 'string') {
      const parsed = new Date(media.timestamp)
      if (!Number.isNaN(parsed.getTime())) postedAt = parsed.toISOString()
    }

    const sanitizedMediaJson = scrubAccessToken(media) as Json

    const { error } = await args.supabase
      .from('raw_benchmark_instagram_media')
      .upsert(
        {
          benchmark_account_id: args.benchmarkAccountId,
          media_id:             media.id,
          media_type:           typeof media.media_type === 'string' ? media.media_type : null,
          permalink:            typeof media.permalink  === 'string' ? media.permalink  : null,
          posted_at:            postedAt,
          like_count:           likeCount,
          comments_count:       commentsCount,
          view_count:           viewCount,
          // reposts: probed for availability only, never read as a
          // per-media value. Keep null per benchmark doctrine.
          reposts:              null,
          metric_availability:  mediaAvailability as unknown as Json,
          fetched_via:          'business_discovery',
          raw_json:             sanitizedMediaJson,
        },
        { onConflict: 'benchmark_account_id,media_id' }
      )

    if (error) {
      errors.push({
        where:   'upsert_media',
        message: error.message,
      })
      continue
    }
    written += 1
  }

  return { written, attempted: list.length, errors }
}

export type PersistProbeRunArgs = {
  supabase:        SupabaseClient<Database>
  igUsername:      string
  detailed:        BenchmarkProbeDetailed
  // Cohort is REQUIRED only when `existingAccountId` is null.
  // When `existingAccountId` is set, cohort is ignored here
  // (immutability is enforced by the CLI surfacing a warning).
  cohort:          TBenchmarkCohort | null
  existingAccountId: string | null
}

export type PersistProbeRunOutcome = {
  result: TBenchmarkPersistResult
  errors: TBenchmarkProbeError[]
}

/**
 * End-to-end persistence flow.
 *
 * Pre-conditions enforced by the CLI before calling this:
 *   - flags validated (no --persist + --dry-run conflict)
 *   - cohort string validated against the enum
 *   - Meta env + Supabase env present
 *   - --cohort supplied if existingAccountId is null
 *   - benchmark_sync_runs row already inserted with status='running';
 *     its id is `runId`.
 */
export async function persistProbeRun(
  args: PersistProbeRunArgs & { runId: string }
): Promise<PersistProbeRunOutcome> {
  const errors: PersistError[] = []
  const detailed = args.detailed
  const probeFailed = detailed.report.fetched_via === null

  // 1. Resolve / create the account.
  let benchmarkAccountId: string | null = args.existingAccountId
  let accountInserted = false

  if (probeFailed) {
    // Nothing useful to write — finish run as failed and bail.
    detailed.report.errors.forEach((e) =>
      errors.push({
        where:   'business_discovery',
        message: e.message,
        ...(typeof e.status === 'number' ? { status: e.status } : {}),
      })
    )
    await closeSyncRun({
      supabase:          args.supabase,
      runId:             args.runId,
      status:            'failed',
      accountsSucceeded: 0,
      mediaFetched:      0,
      errors,
      fetchedVia:        null,
      notes:             'business_discovery_failed',
    })
    return {
      result: {
        run_id:                args.runId,
        status:                'failed',
        benchmark_account_id:  benchmarkAccountId,
        account_inserted:      false,
        account_daily_written: false,
        media_rows_written:    0,
        media_rows_attempted:  0,
      },
      errors: detailed.report.errors,
    }
  }

  if (!benchmarkAccountId) {
    if (!args.cohort) {
      // Defensive: the CLI guarantees this isn't reached, but if
      // it ever is we fail loudly without writing anything else.
      errors.push({
        where:   'insert_benchmark_account',
        message: 'cohort required for first-time account but not provided',
      })
      await closeSyncRun({
        supabase:          args.supabase,
        runId:             args.runId,
        status:            'failed',
        accountsSucceeded: 0,
        mediaFetched:      0,
        errors,
        fetchedVia:        'business_discovery',
        notes:             'cohort_required_for_new_account',
      })
      return {
        result: {
          run_id:                args.runId,
          status:                'failed',
          benchmark_account_id:  null,
          account_inserted:      false,
          account_daily_written: false,
          media_rows_written:    0,
          media_rows_attempted:  0,
        },
        errors: detailed.report.errors,
      }
    }
    const inserted = await insertNewAccount({
      supabase:   args.supabase,
      igUsername: args.igUsername,
      igUserId:   detailed.report.ig_user_id,
      cohort:     args.cohort,
    })
    if (!inserted.ok) {
      errors.push(inserted.error)
      await closeSyncRun({
        supabase:          args.supabase,
        runId:             args.runId,
        status:            'failed',
        accountsSucceeded: 0,
        mediaFetched:      0,
        errors,
        fetchedVia:        'business_discovery',
        notes:             'account_insert_failed',
      })
      return {
        result: {
          run_id:                args.runId,
          status:                'failed',
          benchmark_account_id:  null,
          account_inserted:      false,
          account_daily_written: false,
          media_rows_written:    0,
          media_rows_attempted:  0,
        },
        errors: detailed.report.errors,
      }
    }
    benchmarkAccountId = inserted.accountId
    accountInserted = true
  }

  // 2. Write account daily.
  const dailyRes = await writeAccountDaily({
    supabase:           args.supabase,
    benchmarkAccountId,
    detailed,
  })
  const accountDailyWritten = dailyRes.ok
  if (!dailyRes.ok) errors.push(dailyRes.error)

  // 3. Write media rows.
  const mediaRes = await writeMediaRows({
    supabase:           args.supabase,
    benchmarkAccountId,
    detailed,
  })
  for (const e of mediaRes.errors) errors.push(e)

  // 4. Compute final status.
  //
  // - All required core fields (followers_count, media_count,
  //   like_count, comments_count, view_count) must be 'available'
  //   AND every attempted DB write must have succeeded for
  //   `success`. Reposts unavailable alone never demotes.
  // - Otherwise, if any useful row was persisted (account daily
  //   OR at least one media row), it's `partial`.
  // - Otherwise it's `failed`.
  const af = detailed.report.account_fields
  const mf = detailed.report.media_fields
  const requiredAvailable =
    af.followers_count === 'available' &&
    af.media_count     === 'available' &&
    mf.like_count      === 'available' &&
    mf.comments_count  === 'available' &&
    mf.view_count      === 'available'

  const writesAllOk = accountDailyWritten && mediaRes.errors.length === 0

  let status: TBenchmarkSyncRunStatus
  let notes: string | null
  if (requiredAvailable && writesAllOk) {
    status = 'success'
    notes  = null
  } else if (accountDailyWritten || mediaRes.written > 0) {
    status = 'partial'
    notes  = !requiredAvailable
      ? 'core_fields_unavailable'
      : 'partial_db_writes'
  } else {
    status = 'failed'
    notes  = 'no_useful_rows_written'
  }

  // Add probe-layer errors so the run row carries the upstream
  // signal even when persistence itself fully succeeded.
  for (const e of detailed.report.errors) {
    errors.push({
      where:   e.field ? `probe:${e.field}` : 'probe',
      message: e.message,
      ...(typeof e.status === 'number' ? { status: e.status } : {}),
    })
  }

  await closeSyncRun({
    supabase:          args.supabase,
    runId:             args.runId,
    status,
    accountsSucceeded: status === 'failed' ? 0 : 1,
    mediaFetched:      mediaRes.written,
    errors,
    fetchedVia:        'business_discovery',
    notes,
  })

  return {
    result: {
      run_id:                args.runId,
      status,
      benchmark_account_id:  benchmarkAccountId,
      account_inserted:      accountInserted,
      account_daily_written: accountDailyWritten,
      media_rows_written:    mediaRes.written,
      media_rows_attempted:  mediaRes.attempted,
    },
    errors: detailed.report.errors,
  }
}
