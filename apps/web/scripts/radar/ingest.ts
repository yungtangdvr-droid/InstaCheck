/* eslint-disable no-console */
//
// Meme Radar — RSS ingest CLI.
// Run from apps/web with: pnpm radar:ingest [-- --dry-run] [--source <url>]
//                                            [--since <iso>]   [--limit <n>]
//
// Behavior:
//   - Reads active sources from `radar_sources`.
//   - Fetches each feed via lib/radar/fetch-rss.ts.
//   - Skips items older than the cutoff (default: 7 days; --since overrides).
//   - Idempotent inserts into `raw_radar_items` (unique on source+external_id)
//     and `radar_items` (unique on fingerprint).
//   - Per-source errors do not abort the full run; they are recorded in
//     `radar_sources.last_error` and surfaced in the run summary.
//   - On real runs, updates `radar_sources.last_fetch_at`/`last_error` and
//     writes one `automation_runs` row at the end.
//   - --dry-run fetches/parses/dedups but writes nothing (no source update,
//     no automation_runs row).
//
// No scoring, no Gemini/OpenAI calls, no UI.

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

import { fetchRss } from '../../lib/radar/fetch-rss'
import {
  ingestItem,
  listActiveSources,
  logAutomationRun,
  markSourceFetched,
  type RadarSourceRow,
} from '../../lib/radar/persist'
import { fingerprint } from '../../lib/radar/dedup'

const AUTOMATION_NAME    = 'meme-radar-rss-ingest'
const DEFAULT_AGE_DAYS   = 7

type Cli = {
  dryRun:  boolean
  source:  string | null
  since:   string | null
  limit:   number | null
}

function parseArgv(argv: string[]): Cli {
  let dryRun = false
  let source: string | null = null
  let since:  string | null = null
  let limit:  number | null = null
  const args = argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--source' && i + 1 < args.length) {
      source = args[++i]!
    } else if (arg.startsWith('--source=')) {
      source = arg.slice('--source='.length)
    } else if (arg === '--since' && i + 1 < args.length) {
      since = args[++i]!
    } else if (arg.startsWith('--since=')) {
      since = arg.slice('--since='.length)
    } else if (arg === '--limit' && i + 1 < args.length) {
      const n = Number.parseInt(args[++i]!, 10)
      if (Number.isFinite(n) && n > 0) limit = n
    } else if (arg.startsWith('--limit=')) {
      const n = Number.parseInt(arg.slice('--limit='.length), 10)
      if (Number.isFinite(n) && n > 0) limit = n
    }
  }
  return { dryRun, source, since, limit }
}

function readEnvOrFail(): { supabaseUrl: string; supabaseKey: string } | { error: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const missing: string[] = []
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length) return { error: `missing_env:${missing.join(',')}` }
  return { supabaseUrl: supabaseUrl!, supabaseKey: supabaseKey! }
}

function resolveCutoff(since: string | null): Date {
  if (since) {
    const t = Date.parse(since)
    if (!Number.isFinite(t)) {
      throw new Error(`invalid_since: ${since}`)
    }
    return new Date(t)
  }
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - DEFAULT_AGE_DAYS)
  return d
}

interface PerSourceResult {
  url:           string
  label:         string
  fetched:       number
  eligible:      number
  rawInserted:   number
  itemsInserted: number
  duplicates:    number
  skippedOld:    number
  error?:        string
}

async function processSource(
  supabase:     ReturnType<typeof createClient<Database>>,
  source:       RadarSourceRow,
  cutoff:       Date,
  limit:        number | null,
  dryRun:       boolean,
): Promise<PerSourceResult> {
  const result: PerSourceResult = {
    url:           source.url,
    label:         source.label,
    fetched:       0,
    eligible:      0,
    rawInserted:   0,
    itemsInserted: 0,
    duplicates:    0,
    skippedOld:    0,
  }

  let parsed
  try {
    parsed = await fetchRss(source.url)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch_failed'
    result.error = msg
    if (!dryRun) {
      try {
        await markSourceFetched(supabase, source.id, false, msg)
      } catch (markErr) {
        console.error(`[radar:ingest] mark_source_fetched failed for ${source.url}:`,
          markErr instanceof Error ? markErr.message : markErr)
      }
    }
    return result
  }

  result.fetched = parsed.items.length

  // Cutoff filter — items without a published_at are kept (we cannot prove
  // they are old). De-dup within a single feed by fingerprint to keep the
  // dry-run count consistent with what the DB would accept.
  const seenFp = new Set<string>()
  const eligible = []
  for (const item of parsed.items) {
    if (item.publishedAt) {
      const t = Date.parse(item.publishedAt)
      if (Number.isFinite(t) && t < cutoff.getTime()) {
        result.skippedOld++
        continue
      }
    }
    const fp = fingerprint(item.title, item.url)
    if (seenFp.has(fp)) {
      result.duplicates++
      continue
    }
    seenFp.add(fp)
    eligible.push(item)
    if (limit && eligible.length >= limit) break
  }
  result.eligible = eligible.length

  if (dryRun) {
    return result
  }

  for (const item of eligible) {
    try {
      const r = await ingestItem(supabase, source.id, item)
      if (r.rawInserted)  result.rawInserted++
      if (r.itemInserted) result.itemsInserted++
      if (!r.itemInserted && !r.rawInserted) result.duplicates++
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ingest_item_failed'
      // Continue the loop; first per-item error is surfaced on the source.
      if (!result.error) result.error = msg
      console.error(`[radar:ingest] ${source.url} :: item failed: ${msg}`)
    }
  }

  try {
    await markSourceFetched(supabase, source.id, !result.error, result.error ?? null)
  } catch (markErr) {
    console.error(`[radar:ingest] mark_source_fetched failed for ${source.url}:`,
      markErr instanceof Error ? markErr.message : markErr)
  }

  return result
}

async function main() {
  const cli = parseArgv(process.argv)
  const env = readEnvOrFail()
  if ('error' in env) {
    console.error(`[radar:ingest] cannot run: ${env.error}`)
    process.exit(2)
  }

  let cutoff: Date
  try {
    cutoff = resolveCutoff(cli.since)
  } catch (err) {
    console.error(`[radar:ingest] ${err instanceof Error ? err.message : 'invalid_since'}`)
    process.exit(2)
  }

  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseKey)
  const startedAt = Date.now()

  let sources: RadarSourceRow[]
  try {
    sources = await listActiveSources(supabase, cli.source ?? undefined)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'list_sources_failed'
    console.error(`[radar:ingest] ${msg}`)
    process.exit(1)
  }

  if (sources.length === 0) {
    const summary = {
      ok:           true,
      dryRun:       cli.dryRun,
      reason:       cli.source
        ? `no_active_source_matching:${cli.source}`
        : 'no_active_sources',
      cutoff:       cutoff.toISOString(),
      perSource:    [],
      totalSources: 0,
      durationMs:   Date.now() - startedAt,
    }
    console.log(JSON.stringify(summary, null, 2))
    if (!cli.dryRun) {
      try {
        await logAutomationRun(supabase, 'skipped', summary)
      } catch (err) {
        console.error(`[radar:ingest] automation_runs log failed: ${err instanceof Error ? err.message : err}`)
      }
    }
    return
  }

  const perSource: PerSourceResult[] = []
  for (const source of sources) {
    const r = await processSource(supabase, source, cutoff, cli.limit, cli.dryRun)
    perSource.push(r)
    const tag = cli.dryRun ? '[dry-run]' : '[radar:ingest]'
    if (r.error) {
      console.log(`${tag} ${r.url} → error=${r.error}`)
    } else if (cli.dryRun) {
      console.log(`${tag} ${r.url} → fetched=${r.fetched} eligible=${r.eligible} skippedOld=${r.skippedOld} duplicates=${r.duplicates}`)
    } else {
      console.log(`${tag} ${r.url} → fetched=${r.fetched} eligible=${r.eligible} rawInserted=${r.rawInserted} itemsInserted=${r.itemsInserted} skippedOld=${r.skippedOld} duplicates=${r.duplicates}`)
    }
  }

  const totals = perSource.reduce(
    (acc, r) => {
      acc.fetched       += r.fetched
      acc.eligible      += r.eligible
      acc.rawInserted   += r.rawInserted
      acc.itemsInserted += r.itemsInserted
      acc.skippedOld    += r.skippedOld
      acc.duplicates    += r.duplicates
      if (r.error) acc.errors++
      return acc
    },
    { fetched: 0, eligible: 0, rawInserted: 0, itemsInserted: 0, skippedOld: 0, duplicates: 0, errors: 0 },
  )

  const summary = {
    ok:           totals.errors === 0,
    dryRun:       cli.dryRun,
    automation:   AUTOMATION_NAME,
    cutoff:       cutoff.toISOString(),
    totalSources: sources.length,
    totals,
    perSource,
    durationMs:   Date.now() - startedAt,
  }
  console.log(JSON.stringify(summary, null, 2))

  if (!cli.dryRun) {
    const status: 'success' | 'failed' = totals.errors === 0 ? 'success' : 'failed'
    try {
      await logAutomationRun(supabase, status, summary)
    } catch (err) {
      console.error(`[radar:ingest] automation_runs log failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  if (totals.errors > 0) process.exit(1)
}

main().catch((err) => {
  console.error('[radar:ingest] uncaught:', err)
  process.exit(1)
})
