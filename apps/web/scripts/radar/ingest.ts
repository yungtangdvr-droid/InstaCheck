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

import { logAutomationRun } from '../../lib/radar/persist'
import {
  RADAR_INGEST_AUTOMATION,
  radarIngestDefaultCutoff,
  runRadarIngest,
} from '../../lib/radar/ingest-batch'

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
  return radarIngestDefaultCutoff()
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

  let result
  try {
    result = await runRadarIngest({
      supabase,
      cutoff,
      limit:        cli.limit,
      sourceFilter: cli.source,
      dryRun:       cli.dryRun,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ingest_failed'
    console.error(`[radar:ingest] ${msg}`)
    process.exit(1)
  }

  if (result.totalSources === 0) {
    const summary = {
      ok:           true,
      dryRun:       cli.dryRun,
      reason:       result.noOpReason,
      cutoff:       result.cutoff,
      perSource:    [],
      totalSources: 0,
      durationMs:   result.durationMs,
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

  for (const r of result.perSource) {
    const tag = cli.dryRun ? '[dry-run]' : '[radar:ingest]'
    if (r.error) {
      console.log(`${tag} ${r.url} → error=${r.error}`)
    } else if (cli.dryRun) {
      console.log(`${tag} ${r.url} → fetched=${r.fetched} eligible=${r.eligible} skippedOld=${r.skippedOld} duplicates=${r.duplicates}`)
    } else {
      console.log(`${tag} ${r.url} → fetched=${r.fetched} eligible=${r.eligible} rawInserted=${r.rawInserted} itemsInserted=${r.itemsInserted} skippedOld=${r.skippedOld} duplicates=${r.duplicates}`)
    }
  }

  const summary = {
    ok:           result.ok,
    dryRun:       cli.dryRun,
    automation:   RADAR_INGEST_AUTOMATION,
    cutoff:       result.cutoff,
    totalSources: result.totalSources,
    totals:       result.totals,
    perSource:    result.perSource,
    durationMs:   result.durationMs,
  }
  console.log(JSON.stringify(summary, null, 2))

  if (!cli.dryRun) {
    const status: 'success' | 'failed' = result.totals.errors === 0 ? 'success' : 'failed'
    try {
      await logAutomationRun(supabase, status, summary)
    } catch (err) {
      console.error(`[radar:ingest] automation_runs log failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  if (result.totals.errors > 0) process.exit(1)
}

main().catch((err) => {
  console.error('[radar:ingest] uncaught:', err)
  process.exit(1)
})
