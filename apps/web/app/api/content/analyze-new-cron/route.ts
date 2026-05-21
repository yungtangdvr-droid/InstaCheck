// Cron-facing Content Intelligence trigger.
//
// Called by the n8n `hourly-instagram-live-sync` workflow right after a
// successful POST /api/meta/sync, to classify any newly synced post that
// doesn't have a current-PROMPT_VERSION row in post_content_analysis. This
// route is the N8N_API_KEY twin of POST /api/content/analyze-new (which is
// the operator UI path, gated by Supabase session). Both wrap the same
// runAnalysisBatch({ kind: 'new-only' }) helper, so PROMPT_VERSION,
// candidate selection, upsert shape, and 90-day windowing stay consistent.
//
// Scope guarantees:
// - Selection mode is hard-coded to `new-only`. The archive cannot be
//   analyzed by mistake from this route.
// - Limit is min(CONTENT_ANALYSIS_CRON_BATCH_LIMIT ?? 5, HARD_CAP=10), so an
//   env misconfig can't trigger a runaway analysis from cron.
// - Per-post failures return HTTP 200 with `partial:true`. Only an
//   unhandled exception returns HTTP 500. n8n is configured with
//   continueOnFail:true on this node, so a Gemini outage never fails the
//   sync workflow's success reporting.

import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import { logAutomationRun } from '@/features/automations/queries'
import {
  DEFAULT_MISTRAL_MODEL,
  DEFAULT_MODEL,
  DEFAULT_OPENAI_MODEL,
  runAnalysisBatch,
} from '@/lib/content-analysis/run-analysis-batch'
import { PROMPT_VERSION } from '@/lib/gemini/prompt'

export const runtime = 'nodejs'
export const maxDuration = 300

const AUTOMATION_NAME = 'content-analysis-cron'
const DEFAULT_LIMIT   = 5
const HARD_CAP        = 10

let inFlight = false

function resolveLimit(): number {
  const envRaw    = process.env.CONTENT_ANALYSIS_CRON_BATCH_LIMIT
  const envParsed = envRaw ? Number.parseInt(envRaw, 10) : NaN
  const envLimit  = Number.isFinite(envParsed) && envParsed > 0 ? envParsed : DEFAULT_LIMIT
  return Math.min(envLimit, HARD_CAP)
}

const RETRYABLE_REASON_RE =
  /(\b503\b|unavailable|overloaded|high demand|resource_exhausted|\b429\b|rate.?limit|quota)/i

function isRetryableReason(reason: string | null | undefined): boolean {
  if (!reason) return false
  return RETRYABLE_REASON_RE.test(reason)
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey     = process.env.N8N_API_KEY

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  const geminiKey    = process.env.GEMINI_API_KEY
  const geminiModel  = process.env.GEMINI_MODEL ?? DEFAULT_MODEL
  const metaToken    = process.env.META_ACCESS_TOKEN
  const enabled      = process.env.CONTENT_ANALYSIS_ENABLED === 'true'
  // Same provider fallback chain as the UI route. Presence of each key
  // enables the corresponding hop.
  const openaiKey    = process.env.OPENAI_API_KEY ?? null
  const openaiModel  = process.env.OPENAI_CONTENT_ANALYSIS_MODEL ?? DEFAULT_OPENAI_MODEL
  const mistralKey   = process.env.MISTRAL_API_KEY ?? null
  const mistralModel = process.env.MISTRAL_MODEL ?? DEFAULT_MISTRAL_MODEL

  if (!enabled) {
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient<Database>(supabaseUrl, supabaseKey)
      await logAutomationRun(
        supabase,
        AUTOMATION_NAME,
        'skipped',
        JSON.stringify({
          processed:   0,
          completed:   0,
          failed:      0,
          skipped:     0,
          noOpReason:  'content_analysis_disabled',
          triggeredBy: 'cron',
        }),
      )
    }
    return Response.json({
      ok:         true,
      partial:    false,
      retryable:  false,
      disabled:   true,
      processed:  0,
      completed:  0,
      failed:     0,
      skipped:    0,
      noOpReason: 'content_analysis_disabled',
    })
  }

  const missing: string[] = []
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!geminiKey)   missing.push('GEMINI_API_KEY')
  if (!metaToken)   missing.push('META_ACCESS_TOKEN')
  if (missing.length > 0) {
    return Response.json(
      { ok: false, error: `missing_env:${missing.join(',')}` },
      { status: 500 },
    )
  }

  if (inFlight) {
    return Response.json(
      { ok: false, error: 'Analysis already running' },
      { status: 409 },
    )
  }

  const supabase = createClient<Database>(supabaseUrl!, supabaseKey!)
  const limit    = resolveLimit()

  inFlight = true
  try {
    const result = await runAnalysisBatch({
      supabase,
      selection: { kind: 'new-only' },
      limit,
      ctx: {
        geminiKey:    geminiKey!,
        geminiModel,
        metaToken:    metaToken!,
        openaiKey,
        openaiModel,
        mistralKey,
        mistralModel,
      },
    })

    if (result.processed === 0 && result.noOpReason) {
      await logAutomationRun(
        supabase,
        AUTOMATION_NAME,
        'skipped',
        JSON.stringify({
          processed:     0,
          completed:     0,
          failed:        0,
          skipped:       0,
          noOpReason:    result.noOpReason,
          model:         result.model,
          promptVersion: result.promptVersion,
          limit,
          triggeredBy:   'cron',
        }),
      )
      return Response.json({
        ok:            true,
        partial:       false,
        retryable:     false,
        processed:     0,
        completed:     0,
        failed:        0,
        skipped:       0,
        noOpReason:    result.noOpReason,
        model:         result.model,
        promptVersion: result.promptVersion,
      })
    }

    const failedOutcomes = result.outcomes.filter((o) => o.status === 'failed')
    const errorsSummary  = failedOutcomes
      .slice(0, 5)
      .map((o) => ({ postId: o.postId, reason: o.reason ?? null }))

    const partial   = failedOutcomes.length > 0
    const retryable = partial && failedOutcomes.every((o) => isRetryableReason(o.reason))

    await logAutomationRun(
      supabase,
      AUTOMATION_NAME,
      partial ? 'failed' : 'success',
      JSON.stringify({
        processed:     result.processed,
        completed:     result.completed,
        failed:        result.failed,
        skipped:       result.skipped,
        retryable,
        model:         result.model,
        promptVersion: result.promptVersion,
        limit,
        durationMs:    result.durationMs,
        triggeredBy:   'cron',
      }).slice(0, 500),
    )

    return Response.json({
      ok:            true,
      partial,
      retryable,
      processed:     result.processed,
      completed:     result.completed,
      failed:        result.failed,
      skipped:       result.skipped,
      noOpReason:    null,
      model:         result.model,
      promptVersion: result.promptVersion,
      durationMs:    result.durationMs,
      errors:        errorsSummary,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error'
    console.error('[POST /api/content/analyze-new-cron]', message)
    await logAutomationRun(
      supabase,
      AUTOMATION_NAME,
      'failed',
      JSON.stringify({
        error:         message.slice(0, 500),
        model:         geminiModel,
        promptVersion: PROMPT_VERSION,
        limit,
        triggeredBy:   'cron',
      }).slice(0, 500),
    )
    return Response.json({ ok: false, error: message }, { status: 500 })
  } finally {
    inFlight = false
  }
}
