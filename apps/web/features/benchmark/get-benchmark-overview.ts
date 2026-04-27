// Read-only aggregation feeding /analytics/benchmark.
//
// PR4 doctrine: surface raw diagnostics only. No peer percentile,
// no benchmark score, no scheduled sync. The CLI in
// scripts/benchmark/probe-benchmark.ts is the only writer.
//
// `metric_availability` and `errors` are jsonb columns whose shape
// is enforced upstream by benchmark-persist.ts. They are still
// treated here as untrusted JSON: every read goes through narrow
// type guards so a malformed row never crashes the page.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type {
  TBenchmarkCohort,
  TBenchmarkMetricStatus,
} from '@creator-hub/types'

type Supabase = SupabaseClient<Database>

const METRIC_STATUS_VALUES: ReadonlySet<TBenchmarkMetricStatus> = new Set([
  'available',
  'unavailable_field',
  'unavailable_400',
  'unavailable_403',
  'unavailable_other',
])

function readMetricStatus(json: unknown, key: string): TBenchmarkMetricStatus | null {
  if (json == null || typeof json !== 'object') return null
  const value = (json as Record<string, unknown>)[key]
  if (typeof value !== 'string') return null
  return METRIC_STATUS_VALUES.has(value as TBenchmarkMetricStatus)
    ? (value as TBenchmarkMetricStatus)
    : null
}

export type TBenchmarkRunErrorPreview = {
  where:   string | null
  message: string
  status:  number | null
}

export type TBenchmarkLatestRun = {
  id:                 string
  startedAt:          string
  finishedAt:         string | null
  status:             string
  kind:               string
  accountsAttempted:  number
  accountsSucceeded:  number
  mediaFetched:       number
  notes:              string | null
  fetchedVia:         string | null
  errors:             TBenchmarkRunErrorPreview[]
  errorCount:         number
}

export type TBenchmarkAccountRow = {
  id:                     string
  igUsername:             string
  cohort:                 TBenchmarkCohort
  language:               string | null
  // Latest daily snapshot
  latestSnapshotDate:     string | null
  followersCount:         number | null
  mediaCount:             number | null
  followersAvailability:  TBenchmarkMetricStatus | null
  mediaCountAvailability: TBenchmarkMetricStatus | null
  latestSyncedAt:         string | null
  // Aggregated media stats from sampled rows
  mediaSampleSize:        number
  likeAvg:                number | null
  commentsAvg:            number | null
  viewAvg:                number | null
  likeAvailability:       TBenchmarkMetricStatus | null
  commentsAvailability:   TBenchmarkMetricStatus | null
  viewAvailability:       TBenchmarkMetricStatus | null
  repostsAvailability:    TBenchmarkMetricStatus | null
}

export type TBenchmarkOverview = {
  accounts:  TBenchmarkAccountRow[]
  latestRun: TBenchmarkLatestRun | null
}

const ERRORS_PREVIEW_LIMIT = 3
const ERROR_MESSAGE_MAX_LEN = 240

function parseRunErrors(json: unknown): {
  preview: TBenchmarkRunErrorPreview[]
  count:   number
} {
  if (!Array.isArray(json)) return { preview: [], count: 0 }
  const previews: TBenchmarkRunErrorPreview[] = []
  for (const entry of json) {
    if (entry == null || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const message = typeof e['message'] === 'string' ? e['message'] : null
    if (!message) continue
    const where  = typeof e['where']  === 'string' ? e['where'] : null
    const status = typeof e['status'] === 'number' ? e['status'] : null
    if (previews.length < ERRORS_PREVIEW_LIMIT) {
      previews.push({
        where,
        message: message.length > ERROR_MESSAGE_MAX_LEN
          ? message.slice(0, ERROR_MESSAGE_MAX_LEN) + '…'
          : message,
        status,
      })
    }
  }
  return { preview: previews, count: json.length }
}

export async function getBenchmarkOverview(supabase: Supabase): Promise<TBenchmarkOverview> {
  const [accountsRes, dailyRes, mediaRes, runRes] = await Promise.all([
    supabase
      .from('benchmark_accounts')
      .select('id, ig_username, cohort, language, active')
      .order('ig_username', { ascending: true }),
    supabase
      .from('raw_benchmark_instagram_account_daily')
      .select('benchmark_account_id, date, followers_count, media_count, metric_availability, synced_at')
      .order('date', { ascending: false }),
    supabase
      .from('raw_benchmark_instagram_media')
      .select('benchmark_account_id, like_count, comments_count, view_count, metric_availability, synced_at')
      .order('synced_at', { ascending: false }),
    supabase
      .from('benchmark_sync_runs')
      .select('id, started_at, finished_at, status, kind, accounts_attempted, accounts_succeeded, media_fetched, notes, fetched_via, errors')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // Soft-fail on read errors — the page will render an empty diagnostics view
  // rather than 500. This matches the audience page convention.
  const accounts = accountsRes.data ?? []
  const daily    = dailyRes.data    ?? []
  const media    = mediaRes.data    ?? []
  const run      = runRes.data

  // Latest daily row per account (rows arrive ordered by date desc; first wins).
  const latestDailyByAccount = new Map<string, typeof daily[number]>()
  for (const row of daily) {
    if (!latestDailyByAccount.has(row.benchmark_account_id)) {
      latestDailyByAccount.set(row.benchmark_account_id, row)
    }
  }

  // Per-account media aggregation. Rows arrive ordered by synced_at desc, so
  // the first row encountered is treated as the most-recent sample for the
  // reposts/like/etc. availability flags.
  type MediaAcc = {
    sampleSize:    number
    likeSum:       number
    likeCount:     number
    commentsSum:   number
    commentsCount: number
    viewSum:       number
    viewCount:     number
    latestRow:     typeof media[number] | null
  }
  const mediaByAccount = new Map<string, MediaAcc>()
  for (const row of media) {
    let acc = mediaByAccount.get(row.benchmark_account_id)
    if (!acc) {
      acc = {
        sampleSize:    0,
        likeSum:       0,
        likeCount:     0,
        commentsSum:   0,
        commentsCount: 0,
        viewSum:       0,
        viewCount:     0,
        latestRow:     null,
      }
      mediaByAccount.set(row.benchmark_account_id, acc)
    }
    if (acc.latestRow === null) acc.latestRow = row
    acc.sampleSize += 1
    if (typeof row.like_count === 'number') {
      acc.likeSum   += row.like_count
      acc.likeCount += 1
    }
    if (typeof row.comments_count === 'number') {
      acc.commentsSum   += row.comments_count
      acc.commentsCount += 1
    }
    if (typeof row.view_count === 'number') {
      acc.viewSum   += row.view_count
      acc.viewCount += 1
    }
  }

  const accountRows: TBenchmarkAccountRow[] = accounts
    .filter(a => a.active !== false)
    .map(a => {
      const d = latestDailyByAccount.get(a.id) ?? null
      const m = mediaByAccount.get(a.id) ?? null

      const likeAvg     = m && m.likeCount     > 0 ? m.likeSum     / m.likeCount     : null
      const commentsAvg = m && m.commentsCount > 0 ? m.commentsSum / m.commentsCount : null
      const viewAvg     = m && m.viewCount     > 0 ? m.viewSum     / m.viewCount     : null

      return {
        id:                     a.id,
        igUsername:             a.ig_username,
        cohort:                 a.cohort,
        language:               a.language,
        latestSnapshotDate:     d?.date            ?? null,
        followersCount:         d?.followers_count ?? null,
        mediaCount:             d?.media_count     ?? null,
        followersAvailability:  d ? readMetricStatus(d.metric_availability, 'followers_count') : null,
        mediaCountAvailability: d ? readMetricStatus(d.metric_availability, 'media_count')     : null,
        latestSyncedAt:         d?.synced_at ?? m?.latestRow?.synced_at ?? null,
        mediaSampleSize:        m?.sampleSize ?? 0,
        likeAvg,
        commentsAvg,
        viewAvg,
        likeAvailability:       m?.latestRow ? readMetricStatus(m.latestRow.metric_availability, 'like_count')     : null,
        commentsAvailability:   m?.latestRow ? readMetricStatus(m.latestRow.metric_availability, 'comments_count') : null,
        viewAvailability:       m?.latestRow ? readMetricStatus(m.latestRow.metric_availability, 'view_count')     : null,
        repostsAvailability:    m?.latestRow ? readMetricStatus(m.latestRow.metric_availability, 'reposts')        : null,
      }
    })

  let latestRun: TBenchmarkLatestRun | null = null
  if (run) {
    const parsed = parseRunErrors(run.errors)
    latestRun = {
      id:                 run.id,
      startedAt:          run.started_at,
      finishedAt:         run.finished_at,
      status:             run.status,
      kind:               run.kind,
      accountsAttempted:  run.accounts_attempted,
      accountsSucceeded:  run.accounts_succeeded,
      mediaFetched:       run.media_fetched,
      notes:              run.notes,
      fetchedVia:         run.fetched_via,
      errors:             parsed.preview,
      errorCount:         parsed.count,
    }
  }

  return { accounts: accountRows, latestRun }
}

const COHORT_LABEL_FR: Record<TBenchmarkCohort, string> = {
  core_peer:          'Pair direct',
  adjacent_culture:   'Culture adjacente',
  french_francophone: 'Francophone',
  aspirational:       'Aspirationnel',
}

export function cohortLabelFr(cohort: TBenchmarkCohort): string {
  return COHORT_LABEL_FR[cohort]
}

export function isUnavailableStatus(status: TBenchmarkMetricStatus | null): boolean {
  return status !== null && status !== 'available'
}
