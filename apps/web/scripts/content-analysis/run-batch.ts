/* eslint-disable no-console */
//
// Content Intelligence v1 — manual batch script.
// Run from apps/web with: pnpm content:analyze -- --limit=5
//
// Refuses to call Gemini unless CONTENT_ANALYSIS_ENABLED=true.
// Caps limit at MAX_BATCH_LIMIT regardless of CLI/env input.
// Skips posts that already have a row in post_content_analysis.

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

import { analyzePostMedia } from '../../lib/gemini/analyze'
import { refreshMediaUrl, pickAnalyzableUrl } from '../../lib/meta/refresh-media-url'

const PROVIDER         = 'gemini'
const DEFAULT_MODEL    = 'gemini-2.5-flash'
const DEFAULT_LIMIT    = 5
const MAX_BATCH_LIMIT  = 100
const AUTOMATION_NAME  = 'content-analysis-batch'
const POST_DELAY_MS    = 600 // gentle pacing between Gemini calls

type Cli = { limit: number | null; dryRun: boolean }

function parseArgv(argv: string[]): Cli {
  let limit: number | null = null
  let dryRun = false
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--limit=')) {
      const n = Number.parseInt(arg.slice('--limit='.length), 10)
      if (Number.isFinite(n) && n > 0) limit = n
    } else if (arg === '--dry-run') {
      dryRun = true
    }
  }
  return { limit, dryRun }
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
    .select('post_id')
    .in('post_id', usable.map((r) => r.post_id))
  if (exErr) throw new Error(`existing_query: ${exErr.message}`)

  const skip = new Set((existing ?? []).map((r) => r.post_id))
  return usable.filter((r) => !skip.has(r.post_id)).slice(0, limit)
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
      prompt_version:   'v1',
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
    candidates = await pickCandidates(supabase, limit)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'pick_candidates_failed'
    console.error(`[content-analysis] ${msg}`)
    await logRun(supabase, { error: msg, limit }, false)
    process.exit(1)
  }

  if (candidates.length === 0) {
    console.log(JSON.stringify({ ok: true, processed: 0, reason: 'no_unanalyzed_posts' }, null, 2))
    await logRun(supabase, { processed: 0, reason: 'no_unanalyzed_posts', limit }, true)
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
    processed:  outcomes.length,
    completed:  outcomes.filter((o) => o.status === 'completed').length,
    failed:     outcomes.filter((o) => o.status === 'failed').length,
    skipped:    outcomes.filter((o) => o.status === 'skipped').length,
    model:      env.geminiModel,
    promptVer:  'v1',
    limit,
    durationMs: Date.now() - start,
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
