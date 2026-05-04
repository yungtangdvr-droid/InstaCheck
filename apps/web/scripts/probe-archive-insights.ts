/* eslint-disable no-console */
//
// Archive insights availability probe — local CLI, READ-ONLY.
//
// Goal: empirically test whether Meta returns insights for older
// imported archive posts. Hypothesis: the gap (10,110 imported /
// 1,021 with metrics, with 0 in 2024 and earlier) is partly caused
// by Meta refusing /insights for media posted before the IG account
// became Business / Creator.
//
// What this script does NOT do (by design):
//   - no writes to post_metrics_daily
//   - no writes to raw_instagram_media_insights
//   - no writes to post_archive_state
//   - no writes to automation_runs
//   - no schema migration
//   - no n8n change
//   - no archive review UI change
//   - no scoring change
//   - no retries that can create a rate-limit storm
//
// What it does:
//   - Reads candidate posts from Supabase (year-stratified, no metrics yet).
//   - For each: GET /{media-id} basic fields, then GET /{media-id}/insights.
//   - Classifies the outcome and emits a structured JSON summary.
//   - Hard-caps the total number of probed posts.
//
// Usage (from apps/web):
//   pnpm tsx scripts/probe-archive-insights.ts \
//       --years=2025,2024,2023,2022,2021,2020 --perYear=5
//
// Required env:
//   META_ACCESS_TOKEN
//   META_INSTAGRAM_ACCOUNT_ID
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

import {
  fetchMediaBasicFields,
  fetchMediaInsights,
  type IGMediaBasicFields,
} from '../lib/meta/instagram-client'
import {
  classifyInsightsError,
  classifyInsightsResponse,
  type TInsightsErrorClass,
} from '../lib/meta/classify-insights-error'
import { scrubAccessToken } from '../lib/meta/benchmark-sanitize'
import { sleep } from '../lib/meta/rate-limit'

// Hard cap on the total number of posts probed in a single run,
// regardless of CLI flags. Each probed post costs at most 2 Graph
// calls; at the cap we stay well under the 200 req/h app budget.
const MAX_POSTS_HARD_CAP = 30
const DEFAULT_PER_YEAR   = 5
const DEFAULT_YEARS      = ['2025', '2024', '2023', '2022', '2021', '2020']

const INTER_CALL_SLEEP_MS = 250

// PostgREST encodes `.in('post_id', ids)` as `post_id=in.(uuid1,uuid2,...)`
// in the URL. With ~500 UUIDs the query string crosses ~20 KB, which the
// pooler / undici can reject with a vague `TypeError: fetch failed` and no
// useful `error.cause`. Chunk the lookup to stay well under any URL-length
// limit. 100 keeps each request ~4 KB.
const METRICS_LOOKUP_CHUNK_SIZE = 100

type Cli = {
  years:    number[]
  perYear:  number
  maxPosts: number
  help:     boolean
}

type SamplePost = {
  postId:    string
  mediaId:   string
  mediaType: string | null
  postedAt:  string
  year:      number
}

type PerPostResult = {
  media_id:   string
  posted_at:  string
  media_type: string | null
  year:       number
  fields: {
    ok:          boolean
    like_count?: number | null
    comments_count?: number | null
    error?: {
      status:        number | null
      class:         TInsightsErrorClass
      message:       string | null
    }
  }
  insights: {
    ok:    boolean
    class: TInsightsErrorClass | 'available'
    metric_names?: string[]
    error?: {
      status:        number | null
      message:       string | null
      metric_hint:   string | null
      detail:        string | null
    }
  }
}

function parseArgv(argv: string[]): Cli {
  let yearsRaw: string | null = null
  let perYearRaw: string | null = null
  let maxRaw:  string | null = null
  let help = false

  for (const arg of argv.slice(2)) {
    if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg.startsWith('--years=')) {
      yearsRaw = arg.slice('--years='.length).trim()
    } else if (arg.startsWith('--perYear=')) {
      perYearRaw = arg.slice('--perYear='.length).trim()
    } else if (arg.startsWith('--max=')) {
      maxRaw = arg.slice('--max='.length).trim()
    }
  }

  const yearsList = (yearsRaw && yearsRaw.length > 0
    ? yearsRaw.split(',')
    : DEFAULT_YEARS)
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 2010 && n <= 2100)

  const perYearParsed = perYearRaw ? Number.parseInt(perYearRaw, 10) : DEFAULT_PER_YEAR
  const perYear = Number.isFinite(perYearParsed) && perYearParsed > 0
    ? Math.min(perYearParsed, MAX_POSTS_HARD_CAP)
    : DEFAULT_PER_YEAR

  const maxParsed = maxRaw ? Number.parseInt(maxRaw, 10) : MAX_POSTS_HARD_CAP
  const maxPosts = Number.isFinite(maxParsed) && maxParsed > 0
    ? Math.min(maxParsed, MAX_POSTS_HARD_CAP)
    : MAX_POSTS_HARD_CAP

  return { years: yearsList, perYear, maxPosts, help }
}

function printHelp() {
  const lines = [
    'probe-archive-insights — read-only Meta /insights availability probe',
    '',
    'Usage:',
    '  pnpm tsx scripts/probe-archive-insights.ts [flags]',
    '',
    'Flags:',
    '  --years=<list>    comma-separated calendar years to sample',
    `                    (default: ${DEFAULT_YEARS.join(',')})`,
    `  --perYear=<n>     per-year sample size (default: ${DEFAULT_PER_YEAR})`,
    `  --max=<n>         hard cap on total posts probed (default and max: ${MAX_POSTS_HARD_CAP})`,
    '  --help, -h        show this message',
    '',
    'Required env:',
    '  META_ACCESS_TOKEN',
    '  META_INSTAGRAM_ACCOUNT_ID',
    '  NEXT_PUBLIC_SUPABASE_URL',
    '  SUPABASE_SERVICE_ROLE_KEY',
    '',
    'This probe never writes. Output is a single JSON document on stdout.',
  ]
  console.log(lines.join('\n'))
}

function emit(payload: Record<string, unknown>, code: number): never {
  console.log(JSON.stringify(scrubAccessToken(payload), null, 2))
  process.exit(code)
}

// Defensive: scrub any token that might have leaked into a string
// before printing it. The graphGet error format is "Meta API <s>: <body>",
// and Meta error bodies don't normally contain tokens — but the URL
// query string does, so any other exception printer must go through
// scrubAccessToken too.
function safeMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

type Db = ReturnType<typeof createClient<Database>>

// Deterministic year sampling: oldest-first, ordered by posted_at
// then media_id, with NO offset. Re-running the script gives the
// same sample (modulo new imports). The choice is reported in the
// output under `selection_strategy`.
async function selectSample(
  supabase: Db,
  year:     number,
  perYear:  number
): Promise<SamplePost[]> {
  const yearStart = `${year}-01-01T00:00:00Z`
  const yearEnd   = `${year + 1}-01-01T00:00:00Z`

  // Pull posts in the year window. We filter "no metrics row" in JS
  // because the supabase-js typed client doesn't surface a clean
  // anti-join helper, and the row count per year is small enough
  // that this is fine for a one-shot probe.
  const { data: yearPosts, error: postsErr } = await supabase
    .from('posts')
    .select('id, media_id, media_type, posted_at')
    .gte('posted_at', yearStart)
    .lt('posted_at', yearEnd)
    .order('posted_at', { ascending: true })
    .order('media_id',  { ascending: true })
    .limit(500)
  if (postsErr) throw new Error(`posts query year=${year}: ${postsErr.message}`)
  if (!yearPosts || yearPosts.length === 0) return []

  const ids = yearPosts.map((p) => p.id)
  const withMetrics = new Set<string>()
  for (let chunkIndex = 0; chunkIndex * METRICS_LOOKUP_CHUNK_SIZE < ids.length; chunkIndex++) {
    const start = chunkIndex * METRICS_LOOKUP_CHUNK_SIZE
    const chunk = ids.slice(start, start + METRICS_LOOKUP_CHUNK_SIZE)
    try {
      const { data: metricsRows, error: metricsErr } = await supabase
        .from('post_metrics_daily')
        .select('post_id')
        .in('post_id', chunk)
      if (metricsErr) {
        throw new Error(metricsErr.message)
      }
      for (const r of metricsRows ?? []) withMetrics.add(r.post_id)
    } catch (err) {
      // PostgREST URL-length / pooler / network failures often surface as
      // `TypeError: fetch failed` with the real reason hidden in
      // `error.cause`. Surface both, plus chunk identity, so the operator
      // can act on the failure without guessing.
      const message = safeMessage(err)
      const causeMessage = err instanceof Error && err.cause
        ? safeMessage(err.cause)
        : null
      throw new Error(
        JSON.stringify({
          phase:        'post_metrics_daily_lookup',
          year,
          chunk_index:  chunkIndex,
          chunk_size:   chunk.length,
          chunk_count:  Math.ceil(ids.length / METRICS_LOOKUP_CHUNK_SIZE),
          total_ids:    ids.length,
          message:      truncate(message),
          ...(causeMessage ? { cause: truncate(causeMessage) } : {}),
        })
      )
    }
  }

  const candidates = yearPosts.filter((p) => !withMetrics.has(p.id))

  // Mix media_type where possible: bucket by media_type then
  // round-robin until we hit perYear or exhaust candidates.
  const byType = new Map<string, typeof candidates>()
  for (const c of candidates) {
    const key = c.media_type ?? 'UNKNOWN'
    const bucket = byType.get(key)
    if (bucket) bucket.push(c)
    else byType.set(key, [c])
  }

  const roundRobin: typeof candidates = []
  let remaining = candidates.length
  while (roundRobin.length < perYear && remaining > 0) {
    let madeProgress = false
    for (const bucket of byType.values()) {
      if (bucket.length === 0) continue
      roundRobin.push(bucket.shift()!)
      remaining--
      madeProgress = true
      if (roundRobin.length >= perYear) break
    }
    if (!madeProgress) break
  }

  return roundRobin.map((p) => ({
    postId:    p.id,
    mediaId:   p.media_id,
    mediaType: p.media_type ?? null,
    postedAt:  p.posted_at,
    year,
  }))
}

async function probeOne(args: {
  sample:      SamplePost
  accessToken: string
}): Promise<PerPostResult> {
  const { sample, accessToken } = args

  const result: PerPostResult = {
    media_id:   sample.mediaId,
    posted_at:  sample.postedAt,
    media_type: sample.mediaType,
    year:       sample.year,
    fields: { ok: false },
    insights: { ok: false, class: 'unknown' },
  }

  // Step A — basic media fields.
  try {
    const f: IGMediaBasicFields = await fetchMediaBasicFields(sample.mediaId, accessToken)
    result.fields.ok             = true
    result.fields.like_count     = typeof f.like_count     === 'number' ? f.like_count     : null
    result.fields.comments_count = typeof f.comments_count === 'number' ? f.comments_count : null
  } catch (err) {
    const message = safeMessage(err)
    const cls = classifyInsightsError(message, sample.mediaType)
    result.fields = {
      ok: false,
      error: {
        status:  cls.parsed?.status ?? null,
        class:   cls.class,
        message: cls.parsed?.message ?? truncate(message),
      },
    }
  }

  // Polite spacing between the two calls per post — and between posts.
  await sleep(INTER_CALL_SLEEP_MS)

  // Step B — insights. Reuses the production fetchMediaInsights so
  // the probe sees exactly what production sees (including the
  // VIDEO profile_visits retry).
  try {
    const insights = await fetchMediaInsights(
      sample.mediaId,
      sample.mediaType ?? '',
      accessToken
    )
    const cls = classifyInsightsResponse({ data: insights.data ?? [] })
    if (cls === 'available') {
      result.insights = {
        ok:           true,
        class:        'available',
        metric_names: (insights.data ?? []).map((d) => d.name),
      }
    } else {
      // 200 OK with no usable values. If basic fields succeeded,
      // tag basic_fields_only; otherwise empty_data.
      const downgrade: TInsightsErrorClass =
        result.fields.ok ? 'basic_fields_only' : 'empty_data'
      result.insights = {
        ok:    false,
        class: downgrade,
      }
    }
  } catch (err) {
    const message = safeMessage(err)
    const cls = classifyInsightsError(message, sample.mediaType)
    result.insights = {
      ok: false,
      class: cls.class,
      error: {
        status:      cls.parsed?.status ?? null,
        message:     cls.parsed?.message ?? truncate(message),
        metric_hint: cls.metric ?? null,
        detail:      cls.detail ?? null,
      },
    }
  }

  return result
}

function truncate(s: string): string {
  return s.length > 240 ? `${s.slice(0, 240)}…` : s
}

type ClassCounts = Partial<Record<TInsightsErrorClass | 'available', number>>

function tally(results: PerPostResult[]): {
  insights_classes: ClassCounts
  fields_ok:        number
  fields_failed:    number
  total:            number
} {
  const insights_classes: ClassCounts = {}
  let fields_ok = 0
  for (const r of results) {
    const k = r.insights.class
    insights_classes[k] = (insights_classes[k] ?? 0) + 1
    if (r.fields.ok) fields_ok++
  }
  return {
    insights_classes,
    fields_ok,
    fields_failed: results.length - fields_ok,
    total:         results.length,
  }
}

async function main() {
  const cli = parseArgv(process.argv)
  if (cli.help) {
    printHelp()
    process.exit(0)
  }

  if (cli.years.length === 0) {
    emit(
      {
        ok:    false,
        error: 'invalid_years',
        hint:  'pass --years=YYYY,YYYY,... ; run with --help for usage',
      },
      2
    )
  }

  const accessToken = process.env['META_ACCESS_TOKEN']
  const igUserId    = process.env['META_INSTAGRAM_ACCOUNT_ID']
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY']

  const missingEnv: string[] = []
  if (!accessToken) missingEnv.push('META_ACCESS_TOKEN')
  if (!igUserId)    missingEnv.push('META_INSTAGRAM_ACCOUNT_ID')
  if (!supabaseUrl) missingEnv.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseKey) missingEnv.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missingEnv.length > 0) {
    emit(
      {
        ok:          false,
        error:       'missing_env',
        missing_env: missingEnv,
        hint:        'export the required credentials before running',
      },
      2
    )
  }

  const supabase = createClient<Database>(supabaseUrl!, supabaseKey!, {
    auth: { persistSession: false },
  })

  // Pre-flight: confirm the token can read the account itself.
  // Failing here means EVERY downstream insights call would
  // misclassify as permission_error, so we abort with a clear
  // signal instead of probing.
  try {
    const url = new URL(`https://graph.facebook.com/v21.0/${igUserId}`)
    url.searchParams.set('fields',       'id,username')
    url.searchParams.set('access_token', accessToken!)
    const res = await fetch(url.toString(), { cache: 'no-store' })
    if (!res.ok) {
      const body = await res.text()
      emit(
        {
          ok:    false,
          error: 'preflight_account_failed',
          hint:  'token cannot read /{ig-user-id}; aborting before probe',
          status: res.status,
          body:   truncate(body),
        },
        2
      )
    }
  } catch (err) {
    emit(
      {
        ok:    false,
        error: 'preflight_account_threw',
        hint:  truncate(safeMessage(err)),
      },
      2
    )
  }

  // Year-stratified sampling.
  const samples: SamplePost[] = []
  for (const year of cli.years) {
    const batch = await selectSample(supabase, year, cli.perYear)
    samples.push(...batch)
    if (samples.length >= cli.maxPosts) break
  }
  const capped = samples.slice(0, cli.maxPosts)

  // Probe each, sequentially, to keep request rate low.
  const results: PerPostResult[] = []
  for (const sample of capped) {
    const r = await probeOne({ sample, accessToken: accessToken! })
    results.push(r)
    await sleep(INTER_CALL_SLEEP_MS)
  }

  // Per-year summaries.
  const perYear: Record<string, ReturnType<typeof tally>> = {}
  for (const year of cli.years) {
    const subset = results.filter((r) => r.year === year)
    perYear[String(year)] = tally(subset)
  }

  emit(
    {
      ok:                  true,
      dry_run:             true,
      writes_performed:    false,
      selection_strategy:  'year_stratified_oldest_first_round_robin_by_media_type',
      hard_cap:            MAX_POSTS_HARD_CAP,
      requested: {
        years:    cli.years,
        perYear:  cli.perYear,
        maxPosts: cli.maxPosts,
      },
      sampled_posts: results.length,
      per_year:      perYear,
      overall:       tally(results),
      results,
    },
    0
  )
}

main().catch((err: unknown) => {
  const safe = safeMessage(err).replace(
    /access_token=[^&\s"'<>]*/gi,
    'access_token=REDACTED'
  )
  emit({ ok: false, error: 'unexpected', message: truncate(safe) }, 1)
})
