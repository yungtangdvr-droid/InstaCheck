/* eslint-disable no-console */
//
// Content Intelligence — manual batch script.
// Run from apps/web with: pnpm content:analyze -- --limit=5
//
// Refuses to call Gemini unless CONTENT_ANALYSIS_ENABLED=true.
// Caps limit at MAX_BATCH_LIMIT regardless of CLI/env input.
//
// Retry / reanalysis policy (explicit):
//   - Default: posts with ANY existing row in post_content_analysis are
//     skipped, regardless of status (completed | failed | skipped). A new
//     PROMPT_VERSION therefore applies only to posts analyzed AFTER the
//     bump. Existing rows keep the prompt_version they were written with.
//   - With --reanalyze: existing rows ARE included as candidates and
//     overwritten on upsert (onConflict: 'post_id'). Use this when you
//     have changed the prompt or vocabulary and want to re-classify the
//     historical sample. Combine with --limit and --status= for safety.
//   - --status=completed|failed|skipped (only meaningful with --reanalyze)
//     restricts which existing rows are eligible. Defaults to all three
//     when --reanalyze is set without --status.
//   - --outdated-only (safe migration mode): restricts eligible rows to
//     those whose prompt_version != current PROMPT_VERSION. Posts with no
//     existing row, and rows already on the current version, are skipped.
//     Pair with --reanalyze --status=completed to migrate v1 rows to v2
//     without re-burning quota on rows already on the latest prompt.
//
// MAX_BATCH_LIMIT (=100) is a hard cap on a single run regardless of
// flags, to keep accidental large reruns bounded.

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

import { PROMPT_VERSION } from '../../lib/gemini/prompt'
import {
  ALL_REANALYZE_STATUSES,
  DEFAULT_MODEL,
  runAnalysisBatch,
  type ReanalyzeStatus,
  type SelectionMode,
} from '../../lib/content-analysis/run-analysis-batch'

const DEFAULT_LIMIT    = 5
const MAX_BATCH_LIMIT  = 100
const AUTOMATION_NAME  = 'content-analysis-batch'

type Cli = {
  limit:           number | null
  dryRun:          boolean
  reanalyze:       boolean
  reanalyzeStatus: ReanalyzeStatus[]
  outdatedOnly:    boolean
}

function parseArgv(argv: string[]): Cli {
  let limit: number | null = null
  let dryRun = false
  let reanalyze = false
  let reanalyzeStatus: ReanalyzeStatus[] = []
  let outdatedOnly = false
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--limit=')) {
      const n = Number.parseInt(arg.slice('--limit='.length), 10)
      if (Number.isFinite(n) && n > 0) limit = n
    } else if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--reanalyze') {
      reanalyze = true
    } else if (arg === '--outdated-only') {
      outdatedOnly = true
    } else if (arg.startsWith('--status=')) {
      const raw = arg.slice('--status='.length).split(',').map((s) => s.trim())
      reanalyzeStatus = raw.filter(
        (s): s is ReanalyzeStatus => (ALL_REANALYZE_STATUSES as string[]).includes(s),
      )
    }
  }
  if (reanalyze && reanalyzeStatus.length === 0) {
    reanalyzeStatus = [...ALL_REANALYZE_STATUSES]
  }
  return { limit, dryRun, reanalyze, reanalyzeStatus, outdatedOnly }
}

function resolveLimit(cli: Cli): number {
  const envRaw    = process.env.CONTENT_ANALYSIS_BATCH_LIMIT
  const envParsed = envRaw ? Number.parseInt(envRaw, 10) : NaN
  const envLimit  = Number.isFinite(envParsed) && envParsed > 0 ? envParsed : DEFAULT_LIMIT
  const requested = cli.limit ?? envLimit
  return Math.min(requested, MAX_BATCH_LIMIT)
}

function readEnvOrFail(): {
  supabaseUrl:  string
  supabaseKey:  string
  geminiKey:    string
  geminiModel:  string
  metaToken:    string
  enabled:      boolean
} | { error: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const geminiKey   = process.env.GEMINI_API_KEY
  const geminiModel = process.env.GEMINI_MODEL ?? DEFAULT_MODEL
  const metaToken   = process.env.META_ACCESS_TOKEN
  const enabled     = process.env.CONTENT_ANALYSIS_ENABLED === 'true'

  const missing: string[] = []
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!geminiKey)   missing.push('GEMINI_API_KEY')
  if (!metaToken)   missing.push('META_ACCESS_TOKEN')
  if (missing.length) return { error: `missing_env:${missing.join(',')}` }

  return {
    supabaseUrl: supabaseUrl!,
    supabaseKey: supabaseKey!,
    geminiKey:   geminiKey!,
    geminiModel,
    metaToken:   metaToken!,
    enabled,
  }
}

async function logRun(
  supabase: ReturnType<typeof createClient<Database>>,
  summary:  Record<string, unknown>,
  ok:       boolean,
) {
  const { error } = await supabase.from('automation_runs').insert({
    automation_name: AUTOMATION_NAME,
    status:          ok ? 'success' : 'failed',
    result_summary:  JSON.stringify(summary),
  })
  if (error) console.error(`[automation_runs] insert failed: ${error.message}`)
}

async function main() {
  const cli   = parseArgv(process.argv)
  const env   = readEnvOrFail()
  const limit = resolveLimit(cli)

  if ('error' in env) {
    console.error(`[content-analysis] cannot run: ${env.error}`)
    process.exit(2)
  }

  if (!env.enabled) {
    console.log(JSON.stringify({
      ok:      true,
      skipped: true,
      reason:  'CONTENT_ANALYSIS_ENABLED is not "true" — refusing to call Gemini',
      limit,
      model:   env.geminiModel,
    }, null, 2))
    return
  }

  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseKey)
  const selection: SelectionMode = {
    kind:            'cli',
    reanalyze:       cli.reanalyze,
    reanalyzeStatus: cli.reanalyzeStatus,
    outdatedOnly:    cli.outdatedOnly,
  }

  let result
  try {
    result = await runAnalysisBatch({
      supabase,
      selection,
      limit,
      dryRun: cli.dryRun,
      ctx: {
        geminiKey:   env.geminiKey,
        geminiModel: env.geminiModel,
        metaToken:   env.metaToken,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'pick_candidates_failed'
    console.error(`[content-analysis] ${msg}`)
    await logRun(supabase, { error: msg, limit }, false)
    process.exit(1)
  }

  if (result.outcomes.length === 0 && result.noOpReason) {
    console.log(JSON.stringify({
      ok:                   true,
      processed:            0,
      reason:               result.noOpReason,
      outdatedOnly:         cli.outdatedOnly,
      currentPromptVersion: PROMPT_VERSION,
    }, null, 2))
    await logRun(supabase, {
      processed:            0,
      reason:               result.noOpReason,
      limit,
      outdatedOnly:         cli.outdatedOnly,
      currentPromptVersion: PROMPT_VERSION,
    }, true)
    return
  }

  for (const o of result.outcomes) {
    if (o.reason === 'dry_run') {
      console.log(`[dry-run] would analyze ${o.postId}`)
    } else {
      console.log(`[content-analysis] ${o.postId} → ${o.status}${o.reason ? ` (${o.reason})` : ''}`)
    }
  }

  const summary = {
    processed:            result.processed,
    completed:            result.completed,
    failed:               result.failed,
    skipped:              result.skipped,
    model:                result.model,
    promptVer:            result.promptVersion,
    currentPromptVersion: PROMPT_VERSION,
    limit,
    reanalyze:            cli.reanalyze,
    reanalyzeStatus:      cli.reanalyze ? cli.reanalyzeStatus : null,
    outdatedOnly:         cli.outdatedOnly,
    durationMs:           result.durationMs,
  }
  console.log(JSON.stringify({ ok: true, ...summary }, null, 2))

  const success = summary.failed === 0
  await logRun(supabase, summary, success)
  if (!success) process.exit(1)
}

main().catch((err) => {
  console.error('[content-analysis] uncaught:', err)
  process.exit(1)
})
