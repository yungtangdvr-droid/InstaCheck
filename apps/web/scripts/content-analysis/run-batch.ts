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

import { analyzePostMedia } from '../../lib/gemini/analyze'
import { PROMPT_VERSION } from '../../lib/gemini/prompt'
import { refreshMediaUrl, pickAnalyzableUrl } from '../../lib/meta/refresh-media-url'

const PROVIDER         = 'gemini'
const DEFAULT_MODEL    = 'gemini-2.5-flash'
const DEFAULT_LIMIT    = 5
const MAX_BATCH_LIMIT  = 100
const AUTOMATION_NAME  = 'content-analysis-batch'
const POST_DELAY_MS    = 600 // gentle pacing between Gemini calls

type ReanalyzeStatus = 'completed' | 'failed' | 'skipped'
const ALL_REANALYZE_STATUSES: ReanalyzeStatus[] = ['completed', 'failed', 'skipped']

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

async function pickCandidates(
  supabase: ReturnType<typeof createClient<Database>>,
  limit:    number,
  reanalyze:       boolean,
  reanalyzeStatus: ReanalyzeStatus[],
  outdatedOnly:    boolean,
): Promise<Array<{ post_id: string; media_id: string; media_type: string; caption: string | null }>> {
  // Overfetch 4× so we have spares after excluding already-analyzed posts.
  const overfetch = Math.max(limit * 4, 20)

  const { data: rows, error } = await supabase
    .from('v_mart_post_performance')
    .select('post_id, media_id, media_type, caption')
    .eq('in_last_90d', true)
    .order('performance_score', { ascending: false, nullsFirst: false })
    .limit(overfetch)
  if (error) throw new Error(`mart_query: ${error.message}`)
  if (!rows || rows.length === 0) return []

  const usable = rows.filter(
    (r): r is { post_id: string; media_id: string; media_type: string; caption: string | null } =>
      typeof r.post_id   === 'string' &&
      typeof r.media_id  === 'string' &&
      typeof r.media_type === 'string',
  )

  const { data: existing, error: exErr } = await supabase
    .from('post_content_analysis')
    .select('post_id, status, prompt_version')
    .in('post_id', usable.map((r) => r.post_id))
  if (exErr) throw new Error(`existing_query: ${exErr.message}`)

  type ExistingRow = { post_id: string; status: string | null; prompt_version: string | null }
  const byPost = new Map<string, ExistingRow>(
    (existing ?? []).map((r) => [r.post_id, r as ExistingRow]),
  )

  if (!reanalyze) {
    // Default: any existing row blocks the post from being re-analyzed.
    // Completed rows are preserved; failed/skipped rows are not silently
    // retried (would burn quota on the same broken URL every run).
    // --outdated-only narrows further: only existing rows on an outdated
    // prompt_version are eligible — but since reanalyze is off, those
    // rows would be skipped anyway, so the result is effectively empty.
    if (outdatedOnly) {
      return []
    }
    return usable.filter((r) => !byPost.has(r.post_id)).slice(0, limit)
  }

  // --reanalyze: only KEEP posts whose existing row matches the requested
  // status filter. Posts with no row at all are also kept (treated as
  // first-time analysis), so a single command can both backfill and
  // refresh in one pass — UNLESS --outdated-only is set, in which case
  // we restrict to existing rows whose prompt_version differs from the
  // current PROMPT_VERSION.
  const allowed = new Set(reanalyzeStatus)
  return usable
    .filter((r) => {
      const row = byPost.get(r.post_id)
      if (row === undefined) {
        // No existing row. In outdated-only mode we never touch new posts.
        return !outdatedOnly
      }
      if (row.status === null || !allowed.has(row.status as ReanalyzeStatus)) {
        return false
      }
      if (outdatedOnly && row.prompt_version === PROMPT_VERSION) {
        return false
      }
      return true
    })
    .slice(0, limit)
}

type Outcome = {
  postId:  string
  status:  'completed' | 'failed' | 'skipped'
  reason?: string
}

async function processPost(
  supabase:    ReturnType<typeof createClient<Database>>,
  post:        { post_id: string; media_id: string; media_type: string; caption: string | null },
  ctx:         { geminiKey: string; geminiModel: string; metaToken: string },
): Promise<Outcome> {
  const refresh = await refreshMediaUrl(post.media_id, ctx.metaToken)
  if (!refresh.ok) {
    await upsertSkipped(supabase, post, ctx.geminiModel, refresh.error, null)
    return { postId: post.post_id, status: 'skipped', reason: refresh.error }
  }

  const url = pickAnalyzableUrl(refresh.data)
  if (!url) {
    await upsertSkipped(supabase, post, ctx.geminiModel, 'no_media_url', null)
    return { postId: post.post_id, status: 'skipped', reason: 'no_media_url' }
  }

  const analysis = await analyzePostMedia({
    apiKey:    ctx.geminiKey,
    model:     ctx.geminiModel,
    mediaUrl:  url,
    mediaType: refresh.data.mediaType,
    caption:   post.caption,
  })

  if (!analysis.ok) {
    await upsertFailed(supabase, post, analysis, url)
    return { postId: post.post_id, status: 'failed', reason: analysis.error }
  }

  await upsertCompleted(supabase, post, analysis, url)
  return { postId: post.post_id, status: 'completed' }
}

async function upsertCompleted(
  supabase: ReturnType<typeof createClient<Database>>,
  post:     { post_id: string },
  a:        Extract<Awaited<ReturnType<typeof analyzePostMedia>>, { ok: true }>,
  url:      string,
) {
  const { error } = await supabase.from('post_content_analysis').upsert(
    {
      post_id:               post.post_id,
      provider:              PROVIDER,
      model:                 a.model,
      prompt_version:        a.promptVersion,
      status:                'completed',
      visible_text:          a.data.visible_text,
      language:              a.data.language,
      primary_theme:         a.data.primary_theme,
      secondary_themes:      a.data.secondary_themes,
      humor_type:            a.data.humor_type,
      format_pattern:        a.data.format_pattern,
      cultural_reference:    a.data.cultural_reference,
      niche_level:           a.data.niche_level,
      replication_potential: a.data.replication_potential,
      confidence:            a.data.confidence,
      short_reason:          a.data.short_reason,
      analysis_json:         a.raw as never,
      source_media_url:      url,
      input_tokens:          a.inputTokens,
      output_tokens:         a.outputTokens,
      error_message:         null,
      analyzed_at:           new Date().toISOString(),
    },
    { onConflict: 'post_id' },
  )
  if (error) throw new Error(`upsert_completed:${error.message}`)
}

async function upsertFailed(
  supabase: ReturnType<typeof createClient<Database>>,
  post:     { post_id: string },
  a:        Extract<Awaited<ReturnType<typeof analyzePostMedia>>, { ok: false }>,
  url:      string,
) {
  const { error } = await supabase.from('post_content_analysis').upsert(
    {
      post_id:          post.post_id,
      provider:         PROVIDER,
      model:            a.model,
      prompt_version:   a.promptVersion,
      status:           'failed',
      analysis_json:    (a.raw ?? null) as never,
      source_media_url: url,
      error_message:    a.error.slice(0, 500),
      analyzed_at:      new Date().toISOString(),
    },
    { onConflict: 'post_id' },
  )
  if (error) throw new Error(`upsert_failed:${error.message}`)
}

async function upsertSkipped(
  supabase: ReturnType<typeof createClient<Database>>,
  post:     { post_id: string },
  model:    string,
  reason:   string,
  url:      string | null,
) {
  const { error } = await supabase.from('post_content_analysis').upsert(
    {
      post_id:          post.post_id,
      provider:         PROVIDER,
      model,
      prompt_version:   PROMPT_VERSION,
      status:           'skipped',
      source_media_url: url,
      error_message:    reason.slice(0, 500),
      analyzed_at:      new Date().toISOString(),
    },
    { onConflict: 'post_id' },
  )
  if (error) throw new Error(`upsert_skipped:${error.message}`)
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

async function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
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
  const start    = Date.now()

  let candidates: Awaited<ReturnType<typeof pickCandidates>> = []
  try {
    candidates = await pickCandidates(supabase, limit, cli.reanalyze, cli.reanalyzeStatus, cli.outdatedOnly)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'pick_candidates_failed'
    console.error(`[content-analysis] ${msg}`)
    await logRun(supabase, { error: msg, limit }, false)
    process.exit(1)
  }

  if (candidates.length === 0) {
    const reason = cli.outdatedOnly ? 'no_outdated_posts' : 'no_unanalyzed_posts'
    console.log(JSON.stringify({
      ok:                   true,
      processed:            0,
      reason,
      outdatedOnly:         cli.outdatedOnly,
      currentPromptVersion: PROMPT_VERSION,
    }, null, 2))
    await logRun(supabase, {
      processed:            0,
      reason,
      limit,
      outdatedOnly:         cli.outdatedOnly,
      currentPromptVersion: PROMPT_VERSION,
    }, true)
    return
  }

  console.log(`[content-analysis] running ${candidates.length} post(s) with ${env.geminiModel}`)
  const outcomes: Outcome[] = []

  for (const post of candidates) {
    if (cli.dryRun) {
      console.log(`[dry-run] would analyze ${post.post_id} (media_id=${post.media_id})`)
      outcomes.push({ postId: post.post_id, status: 'skipped', reason: 'dry_run' })
      continue
    }

    try {
      const o = await processPost(supabase, post, {
        geminiKey:   env.geminiKey,
        geminiModel: env.geminiModel,
        metaToken:   env.metaToken,
      })
      outcomes.push(o)
      console.log(`[content-analysis] ${o.postId} → ${o.status}${o.reason ? ` (${o.reason})` : ''}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown_error'
      outcomes.push({ postId: post.post_id, status: 'failed', reason: msg })
      console.error(`[content-analysis] ${post.post_id} → failed (${msg})`)
    }

    await sleep(POST_DELAY_MS)
  }

  const summary = {
    processed:            outcomes.length,
    completed:            outcomes.filter((o) => o.status === 'completed').length,
    failed:               outcomes.filter((o) => o.status === 'failed').length,
    skipped:              outcomes.filter((o) => o.status === 'skipped').length,
    model:                env.geminiModel,
    promptVer:            PROMPT_VERSION,
    currentPromptVersion: PROMPT_VERSION,
    limit,
    reanalyze:            cli.reanalyze,
    reanalyzeStatus:      cli.reanalyze ? cli.reanalyzeStatus : null,
    outdatedOnly:         cli.outdatedOnly,
    durationMs:           Date.now() - start,
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
