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
import { isPendingForCurrentVersion } from './eligibility'

export const PROVIDER          = 'gemini'
export const DEFAULT_MODEL     = 'gemini-2.5-flash'
export const POST_DELAY_MS     = 600 // gentle pacing between Gemini calls

type Supabase = SupabaseClient<Database>

export type ReanalyzeStatus = 'completed' | 'failed' | 'skipped'
export const ALL_REANALYZE_STATUSES: ReanalyzeStatus[] = ['completed', 'failed', 'skipped']

// Two selection modes:
// - `new-only` is the operator UX flow ("analyze posts the operator can see
//   in the app but that aren't analyzed yet"). A post is eligible unless it
//   has a row with BOTH status='completed' AND prompt_version=current. So
//   missing rows, failed/skipped rows, and completed rows on an older
//   prompt version are all picked up. Ordered by posted_at desc so the
//   freshest content wins under the UI hard cap. Always restricted to
//   `in_last_90d = true`.
// - `cli` is the legacy `pnpm content:analyze` path, supporting --reanalyze
//   and --outdated-only flags for explicit re-runs and prompt migrations.
//   `allTime` lifts the `in_last_90d` filter so the operator can backfill
//   the full owner archive; the underlying view is still owner-only, so
//   benchmark/peer media remains excluded.
export type SelectionMode =
  | { kind: 'new-only' }
  | {
      kind:            'cli'
      reanalyze:       boolean
      reanalyzeStatus: ReanalyzeStatus[]
      outdatedOnly:    boolean
      allTime:         boolean
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

type ExistingRow = { post_id: string; status: string | null; prompt_version: string | null }

// Hard ceiling for the read-only `--count-only` path. Larger than any
// realistic single-tenant owner archive but still bounded so a runaway
// scan can't drag Supabase down. Not exported.
const COUNT_FETCH_CEILING = 10_000

async function fetchUsableFromMart(
  supabase:    Supabase,
  selection:   SelectionMode,
  fetchLimit:  number,
): Promise<Candidate[]> {
  // Order strategy depends on mode. The UI flow wants the most recent posts
  // first (operator just synced new content). The CLI flow keeps the
  // historical performance ordering so cohort scans stay deterministic.
  const orderBy: { column: 'posted_at' | 'performance_score'; ascending: boolean } =
    selection.kind === 'new-only'
      ? { column: 'posted_at',         ascending: false }
      : { column: 'performance_score', ascending: false }

  // The UI route always stays inside the 90-day window; the CLI may opt out
  // via --all-time to drain the full owner archive.
  const restrictTo90d =
    selection.kind === 'new-only' || !selection.allTime

  let query = supabase
    .from('v_mart_post_performance')
    .select('post_id, media_id, media_type, caption')
  if (restrictTo90d) query = query.eq('in_last_90d', true)
  query = query
    .order(orderBy.column, { ascending: orderBy.ascending, nullsFirst: false })
    .limit(fetchLimit)

  const { data: rows, error } = await query
  if (error) throw new Error(`mart_query: ${error.message}`)
  if (!rows || rows.length === 0) return []

  return rows.filter(
    (r): r is Candidate =>
      typeof r.post_id    === 'string' &&
      typeof r.media_id   === 'string' &&
      typeof r.media_type === 'string',
  )
}

async function fetchExistingByPost(
  supabase: Supabase,
  postIds:  string[],
): Promise<Map<string, ExistingRow>> {
  if (postIds.length === 0) return new Map()
  const { data: existing, error: exErr } = await supabase
    .from('post_content_analysis')
    .select('post_id, status, prompt_version')
    .in('post_id', postIds)
  if (exErr) throw new Error(`existing_query: ${exErr.message}`)
  return new Map<string, ExistingRow>(
    (existing ?? []).map((r) => [r.post_id, r as ExistingRow]),
  )
}

function applyEligibility(
  usable:    Candidate[],
  byPost:    Map<string, ExistingRow>,
  selection: SelectionMode,
): Candidate[] {
  if (selection.kind === 'new-only') {
    // Eligible = no row OR row that isn't (completed AND current PROMPT_VERSION).
    // The UI hard cap in /api/content/analyze-new still bounds the total work,
    // so retrying failed/skipped rows and migrating old-PV rows is safe.
    return usable.filter((r) => isPendingForCurrentVersion(byPost.get(r.post_id)))
  }

  const { reanalyze, reanalyzeStatus, outdatedOnly } = selection

  if (!reanalyze) {
    if (outdatedOnly) {
      // --outdated-only without --reanalyze is a no-op by design: outdated
      // rows would be skipped anyway since reanalyze is off.
      return []
    }
    return usable.filter((r) => !byPost.has(r.post_id))
  }

  const allowed = new Set(reanalyzeStatus)
  return usable.filter((r) => {
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
}

async function pickCandidates(
  supabase:  Supabase,
  limit:     number,
  selection: SelectionMode,
): Promise<Candidate[]> {
  // Overfetch 4× so we have spares after excluding already-analyzed posts.
  const overfetch = Math.max(limit * 4, 20)
  const usable    = await fetchUsableFromMart(supabase, selection, overfetch)
  if (usable.length === 0) return []
  const byPost    = await fetchExistingByPost(supabase, usable.map((r) => r.post_id))
  return applyEligibility(usable, byPost, selection).slice(0, limit)
}

/**
 * Read-only candidate count. Used by `pnpm content:analyze -- --count-only`
 * to size the backlog before spending Gemini quota. Performs only SELECT
 * queries: no media download, no Gemini call, no upsert. The fetch ceiling
 * is intentionally larger than the analyze path's overfetch so the operator
 * can see beyond a single batch's worth of work.
 */
export async function countCandidates(
  supabase:  Supabase,
  selection: SelectionMode,
): Promise<{ count: number; sampleIds: string[]; allTime: boolean }> {
  const usable  = await fetchUsableFromMart(supabase, selection, COUNT_FETCH_CEILING)
  const byPost  = await fetchExistingByPost(supabase, usable.map((r) => r.post_id))
  const matches = applyEligibility(usable, byPost, selection)
  const allTime = selection.kind === 'cli' && selection.allTime
  return {
    count:     matches.length,
    sampleIds: matches.slice(0, 5).map((c) => c.post_id),
    allTime,
  }
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
