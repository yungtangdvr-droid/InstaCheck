/* eslint-disable no-console */
//
// Archive media date-window probe — local CLI, READ-ONLY.
//
// Goal: empirically test whether `/{ig-user-id}/media` on Graph API
// v21.0 honors time-window parameters (`since` / `until`), so we can
// retrieve media older than the ~2022-03-21 wall where deep cursor
// pagination starts failing with Meta error code 1
// ("Please reduce the amount of data you're asking for").
//
// What this script does NOT do (by design):
//   - no Supabase client, no DB reads, no DB writes
//   - no schema migration
//   - no archive cursor read or reset
//   - no archive-backfill.ts edit
//   - no n8n change
//   - no metrics worker, no scoring, no UI
//   - no retries (a single failure short-circuits the window)
//
// What it does:
//   - For each window, GET /{ig-user-id}/media with the requested
//     strategy (since-until | until-only | since-only | none).
//   - Walks pagination up to a small page cap, with minimal fields.
//   - Reports per-window: pages walked, items, in/out-of-window
//     counts, first/last timestamp, hasNext, Meta error if any.
//   - Emits one scrubbed JSON document on stdout.
//   - Computes a verdict: A_date_window_backfill_feasible
//     | B_date_window_unsupported_or_ignored
//     | C_needs_alternative_strategy.
//
// Usage (from apps/web):
//   pnpm tsx scripts/probe-archive-media-windows.ts \
//       --strategy=since-until --maxPagesPerWindow=5
//
// Required env:
//   META_ACCESS_TOKEN
//   META_INSTAGRAM_ACCOUNT_ID

import { scrubAccessToken } from '../lib/meta/benchmark-sanitize'
import { sleep } from '../lib/meta/rate-limit'

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

// Known wall observed in the manual deep-cursor walk that triggered
// this probe. Any window that successfully returns a `last_timestamp`
// strictly older than this wall is direct evidence that date-window
// pagination unlocks archive content the existing cursor never saw.
const KNOWN_CURSOR_WALL_ISO = '2022-03-21T00:00:00Z'

const DEFAULT_MAX_PAGES_PER_WINDOW = 5
const HARD_CAP_MAX_PAGES_PER_WINDOW = 10
const DEFAULT_LIMIT = 50
const HARD_CAP_LIMIT = 100
const INTER_PAGE_SLEEP_MS = 250
const INTER_WINDOW_SLEEP_MS = 500

type Strategy = 'since-until' | 'until-only' | 'since-only' | 'none'

type Window = {
  startIso: string
  endIso:   string
  label:    string
}

const DEFAULT_WINDOWS: Window[] = [
  { label: '2022-01-01..2022-03-31', startIso: '2022-01-01T00:00:00Z', endIso: '2022-03-31T23:59:59Z' },
  { label: '2021-01-01..2021-12-31', startIso: '2021-01-01T00:00:00Z', endIso: '2021-12-31T23:59:59Z' },
  { label: '2020-01-01..2020-12-31', startIso: '2020-01-01T00:00:00Z', endIso: '2020-12-31T23:59:59Z' },
  { label: '2019-01-01..2019-12-31', startIso: '2019-01-01T00:00:00Z', endIso: '2019-12-31T23:59:59Z' },
]
const WINDOW_2018: Window = {
  label: '2018-01-01..2018-12-31', startIso: '2018-01-01T00:00:00Z', endIso: '2018-12-31T23:59:59Z',
}

type Cli = {
  windows:            Window[]
  maxPagesPerWindow:  number
  limit:              number
  strategy:           Strategy
  help:               boolean
}

type MetaErrorBody = {
  status:  number | null
  code:    number | null
  subcode: number | null
  type:    string | null
  message: string | null
}

type PageReport = {
  page_index:        number
  items:             number
  first_timestamp:   string | null
  last_timestamp:    string | null
  has_next:          boolean
  in_window_count:   number
  out_of_window_count: number
}

type WindowReport = {
  window:               string
  strategy:             Strategy
  since_param:          string | null
  until_param:          string | null
  pages_walked:         number
  items_seen:           number
  first_timestamp:      string | null
  last_timestamp:       string | null
  has_next_at_stop:     boolean
  in_window_count:      number
  out_of_window_count:  number
  in_window_ratio:      number | null
  reached_older_than_wall: boolean
  stopped_reason:
    | 'page_budget'
    | 'no_next_page'
    | 'meta_error'
    | 'all_out_of_window'
  error: MetaErrorBody | null
  pages: PageReport[]
}

function parseArgv(argv: string[]): Cli | { error: string } {
  let windowsRaw: string | null = null
  let maxRaw:     string | null = null
  let limitRaw:   string | null = null
  let strategyRaw: string | null = null
  let includeY2018 = false
  let help = false

  for (const arg of argv.slice(2)) {
    if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--include-2018') {
      includeY2018 = true
    } else if (arg.startsWith('--windows=')) {
      windowsRaw = arg.slice('--windows='.length).trim()
    } else if (arg.startsWith('--maxPagesPerWindow=')) {
      maxRaw = arg.slice('--maxPagesPerWindow='.length).trim()
    } else if (arg.startsWith('--limit=')) {
      limitRaw = arg.slice('--limit='.length).trim()
    } else if (arg.startsWith('--strategy=')) {
      strategyRaw = arg.slice('--strategy='.length).trim()
    }
  }

  let windows: Window[]
  if (windowsRaw && windowsRaw.length > 0) {
    const parsed: Window[] = []
    for (const piece of windowsRaw.split(',')) {
      const m = piece.trim().match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/)
      if (!m) return { error: `invalid --windows entry: ${piece}` }
      const startIso = `${m[1]}T00:00:00Z`
      const endIso   = `${m[2]}T23:59:59Z`
      if (Number.isNaN(Date.parse(startIso)) || Number.isNaN(Date.parse(endIso))) {
        return { error: `invalid --windows entry (not a date): ${piece}` }
      }
      if (Date.parse(startIso) > Date.parse(endIso)) {
        return { error: `invalid --windows entry (start after end): ${piece}` }
      }
      parsed.push({ label: `${m[1]}..${m[2]}`, startIso, endIso })
    }
    windows = parsed
  } else {
    windows = [...DEFAULT_WINDOWS]
    if (includeY2018) windows.push(WINDOW_2018)
  }

  const maxParsed = maxRaw ? Number.parseInt(maxRaw, 10) : DEFAULT_MAX_PAGES_PER_WINDOW
  const maxPagesPerWindow = Number.isFinite(maxParsed) && maxParsed > 0
    ? Math.min(maxParsed, HARD_CAP_MAX_PAGES_PER_WINDOW)
    : DEFAULT_MAX_PAGES_PER_WINDOW

  const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : DEFAULT_LIMIT
  const limit = Number.isFinite(limitParsed) && limitParsed > 0
    ? Math.min(limitParsed, HARD_CAP_LIMIT)
    : DEFAULT_LIMIT

  const strategy: Strategy = (() => {
    switch (strategyRaw) {
      case 'since-until':
      case 'until-only':
      case 'since-only':
      case 'none':
        return strategyRaw
      case null:
      case undefined:
      case '':
        return 'since-until'
      default:
        return 'invalid' as unknown as Strategy
    }
  })()
  if (strategy === ('invalid' as Strategy)) {
    return { error: `invalid --strategy: ${strategyRaw}` }
  }

  return { windows, maxPagesPerWindow, limit, strategy, help }
}

function printHelp() {
  const lines = [
    'probe-archive-media-windows — read-only Meta /media date-window probe',
    '',
    'Usage:',
    '  pnpm tsx scripts/probe-archive-media-windows.ts [flags]',
    '',
    'Flags:',
    '  --windows=<list>            comma-separated YYYY-MM-DD..YYYY-MM-DD windows',
    '                              (default: Q1-2022, 2021, 2020, 2019)',
    '  --include-2018              add 2018 to the default windows',
    `  --maxPagesPerWindow=<n>     pages per window (default ${DEFAULT_MAX_PAGES_PER_WINDOW}, hard cap ${HARD_CAP_MAX_PAGES_PER_WINDOW})`,
    `  --limit=<n>                 page size (default ${DEFAULT_LIMIT}, hard cap ${HARD_CAP_LIMIT})`,
    '  --strategy=<s>              since-until | until-only | since-only | none',
    '                              (default: since-until)',
    '  --help, -h                  show this message',
    '',
    'Required env:',
    '  META_ACCESS_TOKEN',
    '  META_INSTAGRAM_ACCOUNT_ID',
    '',
    'This probe never writes. Output is one scrubbed JSON document on stdout.',
  ]
  console.log(lines.join('\n'))
}

function emit(payload: Record<string, unknown>, code: number): never {
  console.log(JSON.stringify(scrubAccessToken(payload), null, 2))
  process.exit(code)
}

function safeMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function truncate(s: string): string {
  return s.length > 600 ? `${s.slice(0, 600)}…` : s
}

function isoToUnixSeconds(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000)
}

// Tries to parse a Meta API error body. The string format produced by
// graphGet upstream is `Meta API <status>: <body>`; we don't import
// graphGet here because we need to attach `since` / `until` on a
// per-call basis and to capture the parsed Meta error envelope.
type ParsedMetaErrorEnvelope = {
  error?: { code?: number; error_subcode?: number; type?: string; message?: string }
}

function parseMetaError(status: number, bodyText: string): MetaErrorBody {
  let parsed: ParsedMetaErrorEnvelope | null = null
  try {
    parsed = JSON.parse(bodyText) as ParsedMetaErrorEnvelope
  } catch {
    parsed = null
  }
  return {
    status,
    code:    parsed?.error?.code           ?? null,
    subcode: parsed?.error?.error_subcode  ?? null,
    type:    parsed?.error?.type           ?? null,
    message: parsed?.error?.message
      ? truncate(parsed.error.message)
      : truncate(bodyText),
  }
}

type GraphMediaPage = {
  data?: Array<{ id?: string; timestamp?: string; media_type?: string }>
  paging?: {
    cursors?: { after?: string }
    next?:    string
  }
}

type FetchPageOk    = { ok: true;  page: GraphMediaPage }
type FetchPageErr   = { ok: false; error: MetaErrorBody }
type FetchPageThrown = { ok: false; error: MetaErrorBody; threw: true }

async function fetchMediaWindowPage(args: {
  igUserId:    string
  accessToken: string
  limit:       number
  sinceSec:    number | null
  untilSec:    number | null
  after:       string | null
}): Promise<FetchPageOk | FetchPageErr | FetchPageThrown> {
  const url = new URL(`${GRAPH_BASE}/${args.igUserId}/media`)
  url.searchParams.set('fields',       'id,timestamp,media_type')
  url.searchParams.set('limit',        String(args.limit))
  if (args.sinceSec !== null) url.searchParams.set('since', String(args.sinceSec))
  if (args.untilSec !== null) url.searchParams.set('until', String(args.untilSec))
  if (args.after)             url.searchParams.set('after', args.after)
  // access_token must be the LAST param appended and must NEVER be
  // logged. We never log url.toString() anywhere downstream.
  url.searchParams.set('access_token', args.accessToken)

  let res: Response
  try {
    res = await fetch(url.toString(), { cache: 'no-store' })
  } catch (err) {
    return {
      ok: false,
      threw: true,
      error: {
        status:  null,
        code:    null,
        subcode: null,
        type:    'fetch_threw',
        message: truncate(safeMessage(err)),
      },
    }
  }

  if (!res.ok) {
    const bodyText = await res.text()
    return { ok: false, error: parseMetaError(res.status, bodyText) }
  }

  let json: GraphMediaPage
  try {
    json = (await res.json()) as GraphMediaPage
  } catch (err) {
    return {
      ok: false,
      error: {
        status:  res.status,
        code:    null,
        subcode: null,
        type:    'json_parse_error',
        message: truncate(safeMessage(err)),
      },
    }
  }

  return { ok: true, page: json }
}

function classifyTimestamp(ts: string | undefined, w: Window): 'in' | 'out' | 'unparsable' {
  if (!ts) return 'unparsable'
  const t = Date.parse(ts)
  if (Number.isNaN(t)) return 'unparsable'
  if (t < Date.parse(w.startIso)) return 'out'
  if (t > Date.parse(w.endIso))   return 'out'
  return 'in'
}

async function probeWindow(args: {
  window:            Window
  strategy:          Strategy
  igUserId:          string
  accessToken:       string
  limit:             number
  maxPagesPerWindow: number
}): Promise<WindowReport> {
  const sinceSec = args.strategy === 'since-until' || args.strategy === 'since-only'
    ? isoToUnixSeconds(args.window.startIso)
    : null
  const untilSec = args.strategy === 'since-until' || args.strategy === 'until-only'
    ? isoToUnixSeconds(args.window.endIso)
    : null

  const report: WindowReport = {
    window:               args.window.label,
    strategy:             args.strategy,
    since_param:          sinceSec !== null ? String(sinceSec) : null,
    until_param:          untilSec !== null ? String(untilSec) : null,
    pages_walked:         0,
    items_seen:           0,
    first_timestamp:      null,
    last_timestamp:       null,
    has_next_at_stop:     false,
    in_window_count:      0,
    out_of_window_count:  0,
    in_window_ratio:      null,
    reached_older_than_wall: false,
    stopped_reason:       'page_budget',
    error:                null,
    pages:                [],
  }

  let after: string | null = null
  const wallMs = Date.parse(KNOWN_CURSOR_WALL_ISO)

  for (let pageIndex = 0; pageIndex < args.maxPagesPerWindow; pageIndex++) {
    const result = await fetchMediaWindowPage({
      igUserId:    args.igUserId,
      accessToken: args.accessToken,
      limit:       args.limit,
      sinceSec,
      untilSec,
      after,
    })

    if (!result.ok) {
      report.error = result.error
      report.stopped_reason = 'meta_error'
      break
    }

    const items = result.page.data ?? []
    report.pages_walked += 1
    report.items_seen   += items.length

    let pageInWindow = 0
    let pageOutWindow = 0
    let firstTs: string | null = null
    let lastTs: string | null = null

    for (const it of items) {
      const cls = classifyTimestamp(it.timestamp, args.window)
      if (cls === 'in')  pageInWindow  += 1
      if (cls === 'out') pageOutWindow += 1
      if (it.timestamp) {
        if (firstTs === null) firstTs = it.timestamp
        lastTs = it.timestamp
        const tMs = Date.parse(it.timestamp)
        if (!Number.isNaN(tMs) && tMs < wallMs) {
          report.reached_older_than_wall = true
        }
      }
    }

    report.in_window_count     += pageInWindow
    report.out_of_window_count += pageOutWindow
    if (report.first_timestamp === null) report.first_timestamp = firstTs
    if (lastTs !== null)                 report.last_timestamp  = lastTs

    const hasNext = Boolean(result.page.paging?.next)
    const nextAfter = result.page.paging?.cursors?.after ?? null
    report.has_next_at_stop = hasNext

    report.pages.push({
      page_index:          pageIndex,
      items:               items.length,
      first_timestamp:     firstTs,
      last_timestamp:      lastTs,
      has_next:            hasNext,
      in_window_count:     pageInWindow,
      out_of_window_count: pageOutWindow,
    })

    if (!hasNext || !nextAfter) {
      report.stopped_reason = 'no_next_page'
      break
    }

    // If a page returns ZERO in-window items and at least one
    // out-of-window item, the filters are likely not honored or we've
    // walked past the window. Stop early to avoid burning the budget.
    if (pageInWindow === 0 && pageOutWindow > 0 && pageIndex >= 0) {
      report.stopped_reason = 'all_out_of_window'
      break
    }

    after = nextAfter
    await sleep(INTER_PAGE_SLEEP_MS)
  }

  if (report.items_seen > 0) {
    report.in_window_ratio = report.in_window_count / report.items_seen
  }

  return report
}

type Verdict =
  | 'A_date_window_backfill_feasible'
  | 'B_date_window_unsupported_or_ignored'
  | 'C_needs_alternative_strategy'

function computeVerdict(reports: WindowReport[]): {
  verdict: Verdict
  reasoning: string[]
} {
  const reasoning: string[] = []

  const hadMetaError = reports.some((r) => r.error !== null)
  const hadCode1 = reports.some((r) => r.error?.code === 1)
  const allWindowsZero = reports.every((r) => r.items_seen === 0)
  const anyOlderThanWall = reports.some((r) => r.reached_older_than_wall)

  // Mostly out-of-window across all windows = filters ignored.
  const ratios = reports
    .map((r) => r.in_window_ratio)
    .filter((x): x is number => x !== null)
  const lowRatioCount = ratios.filter((r) => r < 0.5).length
  const highRatioCount = ratios.filter((r) => r >= 0.9).length

  // If every window's first_timestamp is roughly identical (within
  // a day), the API is likely returning the same newest-first feed
  // regardless of window. Implies filters are ignored.
  const firstTimestamps = reports
    .map((r) => r.first_timestamp)
    .filter((x): x is string => x !== null)
    .map((s) => Date.parse(s))
    .filter((n) => !Number.isNaN(n))
  let allFirstTimestampsClose = false
  if (firstTimestamps.length >= 2) {
    const min = Math.min(...firstTimestamps)
    const max = Math.max(...firstTimestamps)
    allFirstTimestampsClose = (max - min) < 24 * 60 * 60 * 1000
  }

  if (hadCode1) {
    reasoning.push('Meta error code 1 reproduced inside at least one window — narrower windows or alternate endpoint required.')
    return { verdict: 'C_needs_alternative_strategy', reasoning }
  }

  // 4xx that's not code 1 and not 429 = filters likely rejected.
  const nonCode1Error = reports.find(
    (r) => r.error !== null && r.error.code !== 1 && (r.error.status ?? 0) >= 400 && (r.error.status ?? 0) < 500 && r.error.status !== 429
  )
  if (nonCode1Error) {
    reasoning.push(`Window "${nonCode1Error.window}" rejected with status=${nonCode1Error.error?.status} code=${nonCode1Error.error?.code}.`)
    return { verdict: 'C_needs_alternative_strategy', reasoning }
  }

  if (allWindowsZero) {
    reasoning.push('All windows returned zero items — cannot infer filter support; treat as needing an alternative strategy.')
    return { verdict: 'C_needs_alternative_strategy', reasoning }
  }

  if (allFirstTimestampsClose && reports.length >= 2) {
    reasoning.push('First timestamps across distinct windows are within 24h of each other — looks like the same newest-first feed.')
    return { verdict: 'B_date_window_unsupported_or_ignored', reasoning }
  }

  if (lowRatioCount > highRatioCount && lowRatioCount >= 2) {
    reasoning.push(`Most windows had in_window_ratio < 0.5 (low: ${lowRatioCount}, high: ${highRatioCount}) — filters look ignored or the account has no media in those ranges.`)
    return { verdict: 'B_date_window_unsupported_or_ignored', reasoning }
  }

  if (anyOlderThanWall && highRatioCount >= 1) {
    reasoning.push(`At least one window reached a timestamp older than the known cursor wall (${KNOWN_CURSOR_WALL_ISO}) AND had in_window_ratio ≥ 0.9.`)
    if (hadMetaError) {
      reasoning.push('Some windows also errored — verdict A is conditional; investigate the failing windows.')
    }
    return { verdict: 'A_date_window_backfill_feasible', reasoning }
  }

  reasoning.push('Inconclusive: no window reached older-than-wall timestamps with a high in-window ratio.')
  return { verdict: 'C_needs_alternative_strategy', reasoning }
}

async function preflight(igUserId: string, accessToken: string): Promise<
  | { ok: true; media_count: number | null; username: string | null }
  | { ok: false; error: MetaErrorBody }
> {
  const url = new URL(`${GRAPH_BASE}/${igUserId}`)
  url.searchParams.set('fields', 'id,username,media_count')
  url.searchParams.set('access_token', accessToken)
  let res: Response
  try {
    res = await fetch(url.toString(), { cache: 'no-store' })
  } catch (err) {
    return {
      ok: false,
      error: {
        status: null, code: null, subcode: null, type: 'fetch_threw',
        message: truncate(safeMessage(err)),
      },
    }
  }
  if (!res.ok) {
    return { ok: false, error: parseMetaError(res.status, await res.text()) }
  }
  const json = (await res.json()) as { id?: string; username?: string; media_count?: number }
  return {
    ok: true,
    media_count: typeof json.media_count === 'number' ? json.media_count : null,
    username:    typeof json.username    === 'string' ? json.username    : null,
  }
}

async function main() {
  const cli = parseArgv(process.argv)
  if ('error' in cli) {
    emit({ ok: false, error: 'invalid_argv', hint: cli.error }, 2)
  }
  if (cli.help) {
    printHelp()
    process.exit(0)
  }

  const accessToken = process.env['META_ACCESS_TOKEN']
  const igUserId    = process.env['META_INSTAGRAM_ACCOUNT_ID']

  const missingEnv: string[] = []
  if (!accessToken) missingEnv.push('META_ACCESS_TOKEN')
  if (!igUserId)    missingEnv.push('META_INSTAGRAM_ACCOUNT_ID')
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

  const startedAt = Date.now()
  const pre = await preflight(igUserId!, accessToken!)
  if (!pre.ok) {
    emit(
      {
        ok:    false,
        error: 'preflight_failed',
        hint:  'token cannot read /{ig-user-id}; aborting before probe',
        meta:  pre.error,
      },
      2
    )
  }

  const reports: WindowReport[] = []
  for (const w of cli.windows) {
    const r = await probeWindow({
      window:            w,
      strategy:          cli.strategy,
      igUserId:          igUserId!,
      accessToken:       accessToken!,
      limit:             cli.limit,
      maxPagesPerWindow: cli.maxPagesPerWindow,
    })
    reports.push(r)
    await sleep(INTER_WINDOW_SLEEP_MS)
  }

  const { verdict, reasoning } = computeVerdict(reports)

  emit(
    {
      ok:               true,
      dry_run:          true,
      writes_performed: false,
      runtime_ms:       Date.now() - startedAt,
      meta_account: {
        username:    pre.username,
        media_count: pre.media_count,
      },
      requested: {
        windows:           cli.windows.map((w) => w.label),
        strategy:          cli.strategy,
        limit:             cli.limit,
        maxPagesPerWindow: cli.maxPagesPerWindow,
      },
      caps: {
        hard_cap_max_pages_per_window: HARD_CAP_MAX_PAGES_PER_WINDOW,
        hard_cap_limit:                HARD_CAP_LIMIT,
      },
      known_cursor_wall: KNOWN_CURSOR_WALL_ISO,
      verdict,
      verdict_reasoning: reasoning,
      windows: reports,
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
