// Shared Content Intelligence runner.
//
// Used by both the CLI batch script (`scripts/content-analysis/run-batch.ts`)
// and the operator-facing UI route (`POST /api/content/analyze-new`).
// All Gemini calls flow through this module so the gating rules
// (PROMPT_VERSION, candidate selection, upsert shape, automation logging)
// stay in a single place.
//
// This module never reads `process.env`. Callers pass an explicit context
// (gemini key/model, meta token, automation name, triggeredBy). The CLI
// resolves env vars and CLI flags itself; the API route resolves env vars
// after authenticating the request.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

import { analyzePostMedia } from '../gemini/analyze'
import { PROMPT_VERSION } from '../gemini/prompt'
import { refreshMediaUrl, pickAnalyzableUrl } from '../meta/refresh-media-url'

export const PROVIDER          = 'gemini'
export const DEFAULT_MODEL     = 'gemini-2.5-flash'
export const POST_DELAY_MS     = 600 // gentle pacing between Gemini calls

type Supabase = SupabaseClient<Database>

export type ReanalyzeStatus = 'completed' | 'failed' | 'skipped'
export const ALL_REANALYZE_STATUSES: ReanalyzeStatus[] = ['completed', 'failed', 'skipped']

// Two selection modes:
// - `new-only` is the operator UX flow ("analyze posts that just got synced"):
//   only posts with NO existing row are eligible, ordered by posted_at desc,
//   so the freshest content gets picked up first. This naturally avoids
//   re-analyzing completed v2 rows or migrating old-prompt rows.
// - `cli` is the legacy `pnpm content:analyze` path, supporting --reanalyze
//   and --outdated-only flags for explicit re-runs and prompt migrations.
export type SelectionMode =
  | { kind: 'new-only' }
  | {
      kind:            'cli'
      reanalyze:       boolean
      reanalyzeStatus: ReanalyzeStatus[]
      outdatedOnly:    boolean
    }

export type AnalysisCtx = {
  geminiKey:   string
  geminiModel: string
  metaToken:   string
}

export type RunAnalysisOptions = {
  supabase:  Supabase
  selection: SelectionMode
  limit:     number
  dryRun?:   boolean
  ctx:       AnalysisCtx
}

export type AnalysisOutcome = {
  postId: string
  status: 'completed' | 'failed' | 'skipped'
  reason?: string
}

export type AnalysisRunResult = {
  outcomes:      AnalysisOutcome[]
  processed:     number
  completed:     number
  failed:        number
  skipped:       number
  // Set when nothing was analyzed — distinguishes "no candidates" from a
  // batch where every post failed. Callers use this to short-circuit UX
  // ("no new posts to analyze") and `automation_runs` log status.
  noOpReason:    string | null
  model:         string
  promptVersion: string
  durationMs:    number
  limit:         number
}

type Candidate = {
  post_id:    string
  media_id:   string
  media_type: string
  caption:    string | null
}

async function pickCandidates(
  supabase:  Supabase,
  limit:     number,
  selection: SelectionMode,
): Promise<Candidate[]> {
  // Overfetch 4× so we have spares after excluding already-analyzed posts.
  const overfetch = Math.max(limit * 4, 20)

  // Order strategy depends on mode. The UI flow wants the most recent posts
  // first (operator just synced new content). The CLI flow keeps the
  // historical performance ordering so cohort scans stay deterministic.
  const orderBy: { column: 'posted_at' | 'performance_score'; ascending: boolean } =
    selection.kind === 'new-only'
      ? { column: 'posted_at',         ascending: false }
      : { column: 'performance_score', ascending: false }

  const { data: rows, error } = await supabase
    .from('v_mart_post_performance')
    .select('post_id, media_id, media_type, caption')
    .eq('in_last_90d', true)
    .order(orderBy.column, { ascending: orderBy.ascending, nullsFirst: false })
    .limit(overfetch)
  if (error) throw new Error(`mart_query: ${error.message}`)
  if (!rows || rows.length === 0) return []

  const usable: Candidate[] = rows.filter(
    (r): r is Candidate =>
      typeof r.post_id    === 'string' &&
      typeof r.media_id   === 'string' &&
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

  if (selection.kind === 'new-only') {
    // Only posts with no existing row are eligible. This satisfies all four
    // brief constraints at once: don't reanalyze completed current-PV rows,
    // don't burn quota retrying failed rows, don't migrate old-PV rows from
    // the UI button, and never analyze the full historical archive.
    return usable.filter((r) => !byPost.has(r.post_id)).slice(0, limit)
  }

  const { reanalyze, reanalyzeStatus, outdatedOnly } = selection

  if (!reanalyze) {
    if (outdatedOnly) {
      // --outdated-only without --reanalyze is a no-op by design: outdated
      // rows would be skipped anyway since reanalyze is off.
      return []
    }
    return usable.filter((r) => !byPost.has(r.post_id)).slice(0, limit)
  }

  const allowed = new Set(reanalyzeStatus)
  return usable
    .filter((r) => {
      const row = byPost.get(r.post_id)
      if (row === undefined) {
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

async function processPost(
  supabase: Supabase,
  post:     Candidate,
  ctx:      AnalysisCtx,
): Promise<AnalysisOutcome> {
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
  supabase: Supabase,
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
  supabase: Supabase,
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
  supabase: Supabase,
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

function sleep(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, ms))
}

/**
 * Run a Content Intelligence batch. Pure orchestration: candidate selection,
 * sequential Gemini calls with gentle pacing, upserts. Caller is responsible
 * for env validation, the `CONTENT_ANALYSIS_ENABLED` gate, and writing the
 * outer `automation_runs` row (we expose enough detail in the result for the
 * caller to log a meaningful summary).
 */
export async function runAnalysisBatch(
  options: RunAnalysisOptions,
): Promise<AnalysisRunResult> {
  const { supabase, selection, limit, dryRun = false, ctx } = options
  const start = Date.now()

  let candidates: Candidate[] = []
  candidates = await pickCandidates(supabase, limit, selection)

  if (candidates.length === 0) {
    const noOpReason =
      selection.kind === 'new-only'
        ? 'no_new_posts_to_analyze'
        : (selection.outdatedOnly ? 'no_outdated_posts' : 'no_unanalyzed_posts')
    return {
      outcomes:      [],
      processed:     0,
      completed:     0,
      failed:        0,
      skipped:       0,
      noOpReason,
      model:         ctx.geminiModel,
      promptVersion: PROMPT_VERSION,
      durationMs:    Date.now() - start,
      limit,
    }
  }

  const outcomes: AnalysisOutcome[] = []
  for (const post of candidates) {
    if (dryRun) {
      outcomes.push({ postId: post.post_id, status: 'skipped', reason: 'dry_run' })
      continue
    }

    try {
      const o = await processPost(supabase, post, ctx)
      outcomes.push(o)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown_error'
      outcomes.push({ postId: post.post_id, status: 'failed', reason: msg })
    }

    await sleep(POST_DELAY_MS)
  }

  return {
    outcomes,
    processed:     outcomes.length,
    completed:     outcomes.filter((o) => o.status === 'completed').length,
    failed:        outcomes.filter((o) => o.status === 'failed').length,
    skipped:       outcomes.filter((o) => o.status === 'skipped').length,
    noOpReason:    null,
    model:         ctx.geminiModel,
    promptVersion: PROMPT_VERSION,
    durationMs:    Date.now() - start,
    limit,
  }
}
