/* eslint-disable no-console */
//
// Meme Radar — scoring CLI.
// Run from apps/web with:
//   pnpm radar:score -- --dry-run
//   pnpm radar:score -- --limit=10
//   pnpm radar:score -- --since=2026-04-29T00:00:00Z --reanalyze
//
// Behavior:
//   - Selects radar_items in the last 48h (default), ordered by
//     published_at desc, capped by --limit (default 20, max 60).
//   - Skips items already scored at the current RADAR_PROMPT_VERSION
//     unless --reanalyze.
//   - Calls Gemini first; if a transient failure occurs AND the OpenAI
//     fallback is enabled (CONTENT_ANALYSIS_OPENAI_FALLBACK_ENABLED=true),
//     retries once via OpenAI.
//   - Persists results to radar_item_scores. Composite is computed in
//     code from the model's five sub-scores.
//   - Logs one automation_runs row at the end (real runs only).
//   - --dry-run prints candidates and exits with NO provider calls and
//     NO DB writes.

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

import { RADAR_PROMPT_VERSION } from '../../lib/gemini/radar-prompt'
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_MODEL,
  runRadarScoreBatch,
} from '../../lib/radar/score-batch'
import {
  RADAR_SCORE_AUTOMATION,
  logAutomationRun,
} from '../../lib/radar/persist'

const DEFAULT_LIMIT     = 20
const MAX_BATCH_LIMIT   = 60
const DEFAULT_WINDOW_HR = 48

type Cli = {
  dryRun:    boolean
  limit:     number | null
  since:     string | null
  reanalyze: boolean
}

function parseArgv(argv: string[]): Cli {
  let dryRun    = false
  let limit:  number | null = null
  let since:  string | null = null
  let reanalyze = false
  const args  = argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--reanalyze') {
      reanalyze = true
    } else if (arg.startsWith('--limit=')) {
      const n = Number.parseInt(arg.slice('--limit='.length), 10)
      if (Number.isFinite(n) && n > 0) limit = n
    } else if (arg === '--limit' && i + 1 < args.length) {
      const n = Number.parseInt(args[++i]!, 10)
      if (Number.isFinite(n) && n > 0) limit = n
    } else if (arg.startsWith('--since=')) {
      since = arg.slice('--since='.length)
    } else if (arg === '--since' && i + 1 < args.length) {
      since = args[++i]!
    }
  }
  return { dryRun, limit, since, reanalyze }
}

function resolveLimit(cli: Cli): number {
  const requested = cli.limit ?? DEFAULT_LIMIT
  return Math.min(Math.max(requested, 1), MAX_BATCH_LIMIT)
}

function resolveSince(raw: string | null): string {
  if (raw) {
    const t = Date.parse(raw)
    if (!Number.isFinite(t)) {
      throw new Error(`invalid_since: ${raw}`)
    }
    return new Date(t).toISOString()
  }
  const d = new Date()
  d.setUTCHours(d.getUTCHours() - DEFAULT_WINDOW_HR)
  return d.toISOString()
}

type FullEnv = {
  supabaseUrl:           string
  supabaseKey:           string
  geminiKey:             string
  geminiModel:           string
  openaiFallbackEnabled: boolean
  openaiKey:             string | null
  openaiModel:           string
}

function readEnvOrFail(dryRun: boolean): FullEnv | { error: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const geminiKey   = process.env.GEMINI_API_KEY
  const geminiModel = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL

  const openaiFallbackEnabled =
    process.env.CONTENT_ANALYSIS_OPENAI_FALLBACK_ENABLED === 'true'
  const openaiKeyRaw = process.env.OPENAI_API_KEY
  const openaiModel  = process.env.OPENAI_CONTENT_ANALYSIS_MODEL ?? DEFAULT_OPENAI_MODEL

  const missing: string[] = []
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  // Dry-run only needs Supabase: no provider calls happen.
  if (!dryRun) {
    if (!geminiKey) missing.push('GEMINI_API_KEY')
    if (openaiFallbackEnabled && !openaiKeyRaw) missing.push('OPENAI_API_KEY')
  }
  if (missing.length) return { error: `missing_env:${missing.join(',')}` }

  return {
    supabaseUrl: supabaseUrl!,
    supabaseKey: supabaseKey!,
    geminiKey:   geminiKey ?? '',
    geminiModel,
    openaiFallbackEnabled,
    openaiKey:   openaiFallbackEnabled ? (openaiKeyRaw ?? null) : null,
    openaiModel,
  }
}

async function main() {
  const cli = parseArgv(process.argv)

  const env = readEnvOrFail(cli.dryRun)
  if ('error' in env) {
    console.error(`[radar:score] cannot run: ${env.error}`)
    process.exit(2)
  }

  let since: string
  try {
    since = resolveSince(cli.since)
  } catch (err) {
    console.error(`[radar:score] ${err instanceof Error ? err.message : 'invalid_since'}`)
    process.exit(2)
  }

  const limit    = resolveLimit(cli)
  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseKey)

  let result
  try {
    result = await runRadarScoreBatch({
      supabase,
      since,
      limit,
      reanalyze: cli.reanalyze,
      dryRun:    cli.dryRun,
      ctx: {
        geminiKey:             env.geminiKey,
        geminiModel:           env.geminiModel,
        openaiKey:             env.openaiKey,
        openaiModel:           env.openaiModel,
        openaiFallbackEnabled: env.openaiFallbackEnabled,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'pick_candidates_failed'
    console.error(`[radar:score] ${msg}`)
    if (!cli.dryRun) {
      try {
        await logAutomationRun(
          supabase,
          'failed',
          { error: msg, since, limit, reanalyze: cli.reanalyze, promptVersion: RADAR_PROMPT_VERSION },
          RADAR_SCORE_AUTOMATION,
        )
      } catch (logErr) {
        console.error(`[radar:score] automation_runs log failed: ${logErr instanceof Error ? logErr.message : logErr}`)
      }
    }
    process.exit(1)
  }

  // Per-item human-readable lines.
  if (cli.dryRun) {
    for (const c of result.candidates) {
      const titleSlice = c.title.length > 80 ? `${c.title.slice(0, 80)}…` : c.title
      console.log(`[dry-run] would score ${c.id} :: ${titleSlice} (${c.source_label || 'no-source'})`)
    }
  } else {
    for (const o of result.outcomes) {
      const provider = o.provider ? `provider=${o.provider}` : ''
      const reason   = o.reason   ? ` (${o.reason})`         : ''
      const tail     = [provider, reason].filter(Boolean).join(' ')
      console.log(`[radar:score] ${o.itemId} → ${o.status}${tail ? ` ${tail}` : ''}`)
    }
  }

  const summary = {
    ok:                    cli.dryRun ? true : result.failed === 0,
    dryRun:                cli.dryRun,
    automation:            RADAR_SCORE_AUTOMATION,
    promptVersion:         result.promptVersion,
    since,
    limit,
    reanalyze:             cli.reanalyze,
    candidateCount:        result.candidates.length,
    processed:             result.processed,
    completed:             result.completed,
    failed:                result.failed,
    skipped:               result.skipped,
    providerCounts:        result.providerCounts,
    openaiFallbackEnabled: env.openaiFallbackEnabled,
    noOpReason:            result.noOpReason,
    durationMs:            result.durationMs,
  }
  console.log(JSON.stringify(summary, null, 2))

  if (cli.dryRun) return

  const status: 'success' | 'failed' | 'skipped' =
    result.candidates.length === 0 ? 'skipped'
    : result.failed > 0           ? 'failed'
    :                               'success'
  try {
    await logAutomationRun(supabase, status, summary, RADAR_SCORE_AUTOMATION)
  } catch (err) {
    console.error(`[radar:score] automation_runs log failed: ${err instanceof Error ? err.message : err}`)
  }

  if (status === 'failed') process.exit(1)
}

main().catch((err) => {
  console.error('[radar:score] uncaught:', err)
  process.exit(1)
})
