// Meme Brief — generation batch runner.
//
// Pure orchestration: candidate selection → Gemini primary (OpenAI
// fallback on transient errors) → persistence in `meme_briefs`.
// Mirrors `lib/radar/score-batch.ts`. Library-only; the route /
// CLI / n8n caller is responsible for env validation and logging.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@creator-hub/types/supabase'

import {
  EMPTY_TASTE_PROFILE,
  formatTasteProfileBlock,
  getRadarTasteProfile,
} from '@/lib/radar/taste-profile'

import { BRIEF_PROMPT_VERSION } from './brief-prompt'
import {
  analyzeBriefWithFallback,
  type BriefFallbackResult,
} from './brief-with-fallback'
import {
  insertBrief,
  type MemeBriefInsert,
  type MemeBriefRow,
} from './persist'
import {
  pickBriefCandidates,
  type BriefCandidateSignal,
} from './select-candidates'
import { evaluateBriefQuality } from './quality-guard'

type Supabase = SupabaseClient<Database>

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
export const DEFAULT_BRIEF_LIMIT  = 5
export const BRIEF_HARD_CAP       = 10
export const POST_DELAY_MS        = 600

export type BriefCtx = {
  geminiKey:             string
  geminiModel:           string
  openaiKey:             string | null
  openaiModel:           string
  openaiFallbackEnabled: boolean
}

export type BriefOutcomeStatus = 'completed' | 'failed' | 'quality_guard'

export type BriefOutcome = {
  radarItemId: string
  briefId:     string | null
  title:       string
  status:      BriefOutcomeStatus
  provider:    'gemini' | 'openai' | null
  error:       string | null
}

export interface RunBriefBatchOptions {
  supabase:        Supabase
  limit:           number
  explicitItemId?: string | null
  ctx:             BriefCtx
}

export interface BriefBatchResult {
  outcomes:        BriefOutcome[]
  candidates:      BriefCandidateSignal[]
  processed:       number
  completed:       number
  failed:          number
  qualityGuard:    number
  providerCounts:  { gemini: number; openai: number }
  promptVersion:   string
  noOpReason:      string | null
  durationMs:      number
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function buildCompletedInsert(
  cand:   BriefCandidateSignal,
  result: Extract<BriefFallbackResult, { ok: true }>,
  qualityError: string | null,
): MemeBriefInsert {
  const nowIso = new Date().toISOString()
  return {
    source_radar_item_id:      cand.radarItemId,
    extra_radar_item_ids:      cand.clusterSiblings.map((s) => s.radarItemId),

    signal_title:              cand.title,
    signal_url:                cand.url,
    signal_image_url:          cand.imageUrl,
    signal_summary:            cand.summary,
    source_label:              cand.sourceLabel,
    source_language:           cand.sourceLanguage,

    cultural_tension:          result.data.cultural_tension,
    underlying_feeling:        result.data.underlying_feeling,
    contradiction:             result.data.contradiction,
    meme_compression:          result.data.meme_compression,
    visual_direction:          result.data.visual_direction,
    caption_seed:              result.data.caption_seed,
    why_it_is_memeable:        result.data.why_it_is_memeable,

    yugnat_fit:                result.data.yugnat_fit,
    yugnat_fit_band:           result.data.yugnat_fit_band,
    risk_or_timing_caveat:     result.data.risk_or_timing_caveat,
    suggested_language:        result.data.suggested_language,
    freshness_half_life_hours: result.data.freshness_half_life_hours,

    status:                    'draft',
    status_at:                 nowIso,

    provider:                  result.provider,
    model:                     result.model,
    prompt_version:            result.promptVersion,
    input_tokens:              result.inputTokens,
    output_tokens:             result.outputTokens,
    error_message:             qualityError,
    analysis_json:             result.raw as Json,

    generated_at:              nowIso,
  }
}

function buildFailedInsert(
  cand:   BriefCandidateSignal,
  result: Extract<BriefFallbackResult, { ok: false }>,
): MemeBriefInsert {
  const nowIso = new Date().toISOString()
  return {
    source_radar_item_id:  cand.radarItemId,
    extra_radar_item_ids:  cand.clusterSiblings.map((s) => s.radarItemId),

    signal_title:          cand.title,
    signal_url:            cand.url,
    signal_image_url:      cand.imageUrl,
    signal_summary:        cand.summary,
    source_label:          cand.sourceLabel,
    source_language:       cand.sourceLanguage,

    status:                'discarded',
    status_at:             nowIso,

    provider:              result.provider,
    model:                 result.model,
    prompt_version:        result.promptVersion,
    error_message:         result.error.slice(0, 500),
    analysis_json:         (result.raw ?? null) as Json,
    generated_at:          nowIso,
  }
}

async function processCandidate(
  supabase:          Supabase,
  cand:              BriefCandidateSignal,
  ctx:               BriefCtx,
  tasteProfileBlock: string | null,
): Promise<BriefOutcome> {
  const result = await analyzeBriefWithFallback({
    apiKey: ctx.geminiKey,
    model:  ctx.geminiModel,
    signal: {
      title:        cand.title,
      summary:      cand.summary,
      sourceLabel:  cand.sourceLabel,
      sourceDomain: cand.sourceDomain,
      publishedAt:  cand.publishedAt,
      language:     cand.sourceLanguage,
    },
    clusterSiblings:   cand.clusterSiblings.map((s) => s.title),
    tasteProfileBlock,
    fallback: {
      enabled:     ctx.openaiFallbackEnabled,
      openaiKey:   ctx.openaiKey,
      openaiModel: ctx.openaiModel,
    },
  })

  if (!result.ok) {
    let row: MemeBriefRow | null = null
    try { row = await insertBrief(supabase, buildFailedInsert(cand, result)) } catch { /* swallow */ }
    return {
      radarItemId: cand.radarItemId,
      briefId:     row?.id ?? null,
      title:       cand.title,
      status:      'failed',
      provider:    result.provider,
      error:       result.error,
    }
  }

  const quality = evaluateBriefQuality(
    result.data as unknown as Record<string, unknown>,
    result.raw as Record<string, unknown> | null,
  )
  const qualityError = quality.passed ? null : quality.message

  const row = await insertBrief(supabase, buildCompletedInsert(cand, result, qualityError))

  if (qualityError) {
    return {
      radarItemId: cand.radarItemId,
      briefId:     row.id,
      title:       cand.title,
      status:      'quality_guard',
      provider:    result.provider,
      error:       qualityError,
    }
  }

  return {
    radarItemId: cand.radarItemId,
    briefId:     row.id,
    title:       cand.title,
    status:      'completed',
    provider:    result.provider,
    error:       null,
  }
}

export async function runBriefBatch(
  options: RunBriefBatchOptions,
): Promise<BriefBatchResult> {
  const { supabase, ctx, explicitItemId = null } = options
  const limit = Math.max(1, Math.min(options.limit, BRIEF_HARD_CAP))
  const start = Date.now()

  const picked = await pickBriefCandidates(supabase, { limit, explicitItemId })
  const candidates = picked.candidates

  if (candidates.length === 0) {
    const reason: string = explicitItemId
      ? (picked.explicitReason ?? 'missing_radar_item')
      : 'no_eligible_candidates'
    return {
      outcomes:       [],
      candidates:     [],
      processed:      0,
      completed:      0,
      failed:         0,
      qualityGuard:   0,
      providerCounts: { gemini: 0, openai: 0 },
      promptVersion:  BRIEF_PROMPT_VERSION,
      noOpReason:     reason,
      durationMs:     Date.now() - start,
    }
  }

  // Compute the taste profile once per batch (soft-fail to empty).
  let tasteProfileBlock: string | null = null
  try {
    const profile = await getRadarTasteProfile(supabase)
    tasteProfileBlock = formatTasteProfileBlock(profile)
  } catch {
    tasteProfileBlock = formatTasteProfileBlock(EMPTY_TASTE_PROFILE)
  }

  const outcomes: BriefOutcome[] = []
  let completed = 0
  let failed    = 0
  let quality   = 0
  const providerCounts = { gemini: 0, openai: 0 }

  for (const cand of candidates) {
    const outcome = await processCandidate(supabase, cand, ctx, tasteProfileBlock)
    outcomes.push(outcome)
    if (outcome.status === 'completed')     completed += 1
    if (outcome.status === 'failed')        failed    += 1
    if (outcome.status === 'quality_guard') quality   += 1
    if (outcome.provider === 'gemini') providerCounts.gemini += 1
    if (outcome.provider === 'openai') providerCounts.openai += 1
    if (candidates.length > 1) await sleep(POST_DELAY_MS)
  }

  return {
    outcomes,
    candidates,
    processed:      outcomes.length,
    completed,
    failed,
    qualityGuard:   quality,
    providerCounts,
    promptVersion:  BRIEF_PROMPT_VERSION,
    noOpReason:     null,
    durationMs:     Date.now() - start,
  }
}
