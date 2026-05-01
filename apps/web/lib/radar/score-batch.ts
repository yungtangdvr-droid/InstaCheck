// Meme Radar — scoring batch runner.
//
// Pure orchestration: candidate selection, sequential provider calls
// (Gemini primary → optional OpenAI fallback on transient errors),
// upsert into `radar_item_scores`. The CLI script wraps this with
// env validation, dry-run printing, and the `automation_runs` log.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@creator-hub/types/supabase'

import { radarComposite } from '@creator-hub/scoring'

import { RADAR_PROMPT_VERSION } from '../gemini/radar-prompt'
import {
  analyzeRadarWithFallback,
  type RadarFallbackResult,
} from './score-with-fallback'
import {
  fetchExistingScores,
  fetchRadarCandidates,
  fetchSourcesByIds,
  upsertRadarScore,
  type RadarScoreCandidateWithSource,
} from './persist'
import {
  EMPTY_TASTE_PROFILE,
  formatTasteProfileBlock,
  getRadarTasteProfile,
} from './taste-profile'

type Supabase = SupabaseClient<Database>

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
export const POST_DELAY_MS        = 600 // gentle pacing between provider calls

export type RadarOutcomeStatus = 'completed' | 'failed' | 'skipped'

export type RadarScoreOutcome = {
  itemId:   string
  title:    string
  status:   RadarOutcomeStatus
  reason?:  string
  provider?: 'gemini' | 'openai'
}

export type RadarScoreCtx = {
  geminiKey:             string
  geminiModel:           string
  openaiKey:             string | null
  openaiModel:           string
  openaiFallbackEnabled: boolean
}

export type RunRadarScoreOptions = {
  supabase: Supabase
  since:    string
  limit:    number
  reanalyze: boolean
  dryRun?:   boolean
  ctx:       RadarScoreCtx
}

export type RadarScoreRunResult = {
  outcomes:       RadarScoreOutcome[]
  candidates:     RadarScoreCandidateWithSource[]
  processed:      number
  completed:      number
  failed:         number
  skipped:        number
  providerCounts: { gemini: number; openai: number }
  noOpReason:     string | null
  promptVersion:  string
  durationMs:     number
}

function safeDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function isUsable(c: { title: string; summary: string | null }): boolean {
  const titleOk   = typeof c.title === 'string' && c.title.trim().length > 0
  const summaryOk = typeof c.summary === 'string' && c.summary.trim().length > 0
  // Skipped only if BOTH title and summary are unusable (per agreed criterion).
  return titleOk || summaryOk
}

async function pickCandidates(
  supabase:  Supabase,
  since:     string,
  limit:     number,
  reanalyze: boolean,
): Promise<RadarScoreCandidateWithSource[]> {
  // Overfetch so eligibility filtering (existing-row check) does not
  // starve the batch. Cap is the limit × 4, mirrored from
  // `run-analysis-batch.ts`'s new-only path.
  const overfetch = Math.max(limit * 4, 20)
  const rows      = await fetchRadarCandidates(supabase, { since, limit: overfetch })
  if (rows.length === 0) return []

  const existing  = await fetchExistingScores(supabase, rows.map((r) => r.id))

  const eligible = rows.filter((r) => {
    const ex = existing.get(r.id)
    if (!ex) return true                           // never scored
    if (reanalyze) return true                     // explicit re-score
    // Default: skip rows already scored at the current prompt version.
    return ex.prompt_version !== RADAR_PROMPT_VERSION
  })
  if (eligible.length === 0) return []

  const sources = await fetchSourcesByIds(supabase, [...new Set(eligible.map((r) => r.source_id))])
  return eligible.slice(0, limit).map((r) => {
    const src = sources.get(r.source_id)
    return {
      ...r,
      source_label: src?.label ?? '',
      source_url:   src?.url   ?? '',
    }
  })
}

function buildCompletedInsert(
  candidate: RadarScoreCandidateWithSource,
  result:    Extract<RadarFallbackResult, { ok: true }>,
) {
  const composite = radarComposite({
    memePotential:     result.data.meme_potential,
    yugnatFit:         result.data.yugnat_fit,
    timingUrgency:     result.data.timing_urgency,
    visualPotential:   result.data.visual_potential,
    culturalRelevance: result.data.cultural_relevance,
  })

  return {
    radar_item_id:       candidate.id,
    provider:            result.provider,
    model:               result.model,
    prompt_version:      result.promptVersion,
    status:              'completed' as const,
    meme_potential:      result.data.meme_potential,
    yugnat_fit:          result.data.yugnat_fit,
    timing_urgency:      result.data.timing_urgency,
    visual_potential:    result.data.visual_potential,
    cultural_relevance:  result.data.cultural_relevance,
    composite,
    why_memable:         result.data.why_memable,
    meme_angles:         result.data.meme_angles as unknown as Json,
    recommended_format:  result.data.recommended_format,
    cultural_references: result.data.cultural_references,
    primary_theme:       result.data.primary_theme,
    timing_window_hours: result.data.timing_window_hours,
    sensitivity_context: result.data.sensitivity_context,
    controversy_level:   result.data.controversy_level,
    misinformation_risk: result.data.misinformation_risk,
    legal_caution:       result.data.legal_caution,
    tragedy_context:     result.data.tragedy_context,
    confidence:          result.data.confidence,
    short_reason:        result.data.short_reason,
    analysis_json:       result.raw as Json,
    input_tokens:        result.inputTokens,
    output_tokens:       result.outputTokens,
    error_message:       null,
    scored_at:           new Date().toISOString(),
  }
}

function buildFailedInsert(
  candidate: RadarScoreCandidateWithSource,
  result:    Extract<RadarFallbackResult, { ok: false }>,
) {
  return {
    radar_item_id:  candidate.id,
    provider:       result.provider,
    model:          result.model,
    prompt_version: result.promptVersion,
    status:         'failed' as const,
    analysis_json:  (result.raw ?? null) as Json,
    error_message:  result.error.slice(0, 500),
    scored_at:      new Date().toISOString(),
  }
}

function buildSkippedInsert(
  candidate: RadarScoreCandidateWithSource,
  geminiModel: string,
) {
  return {
    radar_item_id:  candidate.id,
    provider:       'gemini',
    model:          geminiModel,
    prompt_version: RADAR_PROMPT_VERSION,
    status:         'skipped' as const,
    error_message:  'no_usable_text',
    scored_at:      new Date().toISOString(),
  }
}

async function processItem(
  supabase:          Supabase,
  candidate:         RadarScoreCandidateWithSource,
  ctx:               RadarScoreCtx,
  tasteProfileBlock: string | null,
): Promise<RadarScoreOutcome> {
  if (!isUsable(candidate)) {
    await upsertRadarScore(supabase, buildSkippedInsert(candidate, ctx.geminiModel))
    return { itemId: candidate.id, title: candidate.title, status: 'skipped', reason: 'no_usable_text' }
  }

  const result = await analyzeRadarWithFallback({
    apiKey: ctx.geminiKey,
    model:  ctx.geminiModel,
    item: {
      title:        candidate.title,
      summary:      candidate.summary,
      sourceLabel:  candidate.source_label,
      sourceDomain: safeDomain(candidate.source_url || candidate.url),
      publishedAt:  candidate.published_at,
    },
    tasteProfileBlock,
    fallback: {
      enabled:     ctx.openaiFallbackEnabled,
      openaiKey:   ctx.openaiKey,
      openaiModel: ctx.openaiModel,
    },
  })

  if (!result.ok) {
    await upsertRadarScore(supabase, buildFailedInsert(candidate, result))
    return {
      itemId:   candidate.id,
      title:    candidate.title,
      status:   'failed',
      reason:   result.error,
      provider: result.provider,
    }
  }

  await upsertRadarScore(supabase, buildCompletedInsert(candidate, result))
  return {
    itemId:   candidate.id,
    title:    candidate.title,
    status:   'completed',
    provider: result.provider,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, ms))
}

export async function runRadarScoreBatch(
  options: RunRadarScoreOptions,
): Promise<RadarScoreRunResult> {
  const { supabase, since, limit, reanalyze, dryRun = false, ctx } = options
  const start = Date.now()

  const candidates = await pickCandidates(supabase, since, limit, reanalyze)

  // Compute the taste profile once per batch. Soft-fail: a fetch error
  // must not block scoring — the prompt simply runs without the block.
  let tasteProfileBlock: string | null = null
  if (!dryRun && candidates.length > 0) {
    try {
      const profile = await getRadarTasteProfile(supabase)
      tasteProfileBlock = formatTasteProfileBlock(profile)
    } catch {
      tasteProfileBlock = formatTasteProfileBlock(EMPTY_TASTE_PROFILE)
    }
  }

  if (candidates.length === 0) {
    return {
      outcomes:       [],
      candidates:     [],
      processed:      0,
      completed:      0,
      failed:         0,
      skipped:        0,
      providerCounts: { gemini: 0, openai: 0 },
      noOpReason:     reanalyze ? 'no_radar_items_in_window' : 'no_unscored_radar_items',
      promptVersion:  RADAR_PROMPT_VERSION,
      durationMs:     Date.now() - start,
    }
  }

  const outcomes: RadarScoreOutcome[] = []
  if (dryRun) {
    for (const c of candidates) {
      outcomes.push({ itemId: c.id, title: c.title, status: 'skipped', reason: 'dry_run' })
    }
    return {
      outcomes,
      candidates,
      processed:      0,
      completed:      0,
      failed:         0,
      skipped:        0,
      providerCounts: { gemini: 0, openai: 0 },
      noOpReason:     null,
      promptVersion:  RADAR_PROMPT_VERSION,
      durationMs:     Date.now() - start,
    }
  }

  for (const candidate of candidates) {
    try {
      const o = await processItem(supabase, candidate, ctx, tasteProfileBlock)
      outcomes.push(o)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown_error'
      outcomes.push({ itemId: candidate.id, title: candidate.title, status: 'failed', reason: msg })
    }
    await sleep(POST_DELAY_MS)
  }

  const providerCounts = { gemini: 0, openai: 0 }
  for (const o of outcomes) {
    if (o.status === 'completed' && (o.provider === 'gemini' || o.provider === 'openai')) {
      providerCounts[o.provider]++
    }
  }

  return {
    outcomes,
    candidates,
    processed:      outcomes.length,
    completed:      outcomes.filter((o) => o.status === 'completed').length,
    failed:         outcomes.filter((o) => o.status === 'failed').length,
    skipped:        outcomes.filter((o) => o.status === 'skipped').length,
    providerCounts,
    noOpReason:     null,
    promptVersion:  RADAR_PROMPT_VERSION,
    durationMs:     Date.now() - start,
  }
}
