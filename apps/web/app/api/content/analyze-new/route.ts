// Manual Content Intelligence trigger for the operator.
// Called by SyncNowButton right after a successful Meta sync to
// classify any newly synced post that doesn't have a current-PROMPT_VERSION
// row in post_content_analysis. No cron, no background queue.
//
// The whole batch runs server-side: the browser never sees GEMINI_API_KEY,
// META_ACCESS_TOKEN, or SUPABASE_SERVICE_ROLE_KEY. The route is gated by
// `CONTENT_ANALYSIS_ENABLED` and capped at `UI_HARD_MAX` regardless of
// `CONTENT_ANALYSIS_BATCH_LIMIT` so an env misconfig can't trigger a
// runaway analysis from the UI.

import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  DEFAULT_MODEL,
  runAnalysisBatch,
} from '@/lib/content-analysis/run-analysis-batch'
import { PROMPT_VERSION } from '@/lib/gemini/prompt'

export const runtime = 'nodejs'
export const maxDuration = 300

const AUTOMATION_NAME = 'content-analysis-manual'
const DEFAULT_LIMIT   = 5
const UI_HARD_MAX     = 20

// Best-effort in-process guard. Cold starts reset this; that is fine — it
// just keeps the same instance from running two concurrent batches.
let inFlight = false

function resolveLimit(): number {
  const envRaw    = process.env.CONTENT_ANALYSIS_BATCH_LIMIT
  const envParsed = envRaw ? Number.parseInt(envRaw, 10) : NaN
  const envLimit  = Number.isFinite(envParsed) && envParsed > 0 ? envParsed : DEFAULT_LIMIT
  return Math.min(envLimit, UI_HARD_MAX)
}

// Per-post failure reasons we treat as "try again later" rather than a hard
// failure. Gemini surfaces 503/UNAVAILABLE under load, plus 429/quota when
// the project is rate-limited. The route reports these to the UI as
// retryable so the operator sees a "relance dans quelques minutes" hint
// instead of a generic error.
const RETRYABLE_REASON_RE =
  /(\b503\b|unavailable|overloaded|high demand|resource_exhausted|\b429\b|rate.?limit|quota)/i

function isRetryableReason(reason: string | null | undefined): boolean {
  if (!reason) return false
  return RETRYABLE_REASON_RE.test(reason)
}

export async function POST(_request: NextRequest) {
  const authClient = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await authClient.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  const geminiKey    = process.env.GEMINI_API_KEY
  const geminiModel  = process.env.GEMINI_MODEL ?? DEFAULT_MODEL
  const metaToken    = process.env.META_ACCESS_TOKEN
  const enabled      = process.env.CONTENT_ANALYSIS_ENABLED === 'true'

  if (!enabled) {
    // Soft no-op: surfaced to the UI as a non-error so the sync flow can
    // continue to render success without flagging the operator.
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
        geminiKey:             geminiKey!,
        geminiModel,
        metaToken:             metaToken!,
        // OpenAI fallback intentionally disabled on the UI route in this
        // PR — the manual UI path stays Gemini-only until we expose the
        // fallback in the route's response/automation_runs summary.
        openaiKey:             null,
        openaiModel:           '',
        openaiFallbackEnabled: false,
      },
    })

    if (result.processed === 0 && result.noOpReason) {
      await supabase.from('automation_runs').insert({
        automation_name: AUTOMATION_NAME,
        status:          'skipped',
        result_summary:  JSON.stringify({
          processed:     0,
          completed:     0,
          failed:        0,
          skipped:       0,
          noOpReason:    result.noOpReason,
          model:         result.model,
          promptVersion: result.promptVersion,
          limit,
          triggeredBy:   'manual',
        }),
      })
      return Response.json({
        ok:         true,
        partial:    false,
        retryable:  false,
        processed:  0,
        completed:  0,
        failed:     0,
        skipped:    0,
        noOpReason: result.noOpReason,
        model:      result.model,
        promptVersion: result.promptVersion,
      })
    }

    const failedOutcomes = result.outcomes.filter((o) => o.status === 'failed')
    const errorsSummary  = failedOutcomes
      .slice(0, 5)
      .map((o) => ({ postId: o.postId, reason: o.reason ?? null }))

    // Per-post failures are not route-level failures: the API call itself
    // succeeded, we just couldn't classify some posts. We always return
    // ok:true here and let the UI render the partial/retryable hints.
    // Only an unhandled exception below (caught in the catch block) returns
    // ok:false / HTTP 500.
    const partial   = failedOutcomes.length > 0
    const retryable = partial && failedOutcomes.every((o) => isRetryableReason(o.reason))

    // automation_runs still distinguishes a clean batch from anything that
    // hit a per-post failure so the operator can audit it later.
    await supabase.from('automation_runs').insert({
      automation_name: AUTOMATION_NAME,
      status:          partial ? 'failed' : 'success',
      result_summary:  JSON.stringify({
        processed:     result.processed,
        completed:     result.completed,
        failed:        result.failed,
        skipped:       result.skipped,
        retryable,
        model:         result.model,
        promptVersion: result.promptVersion,
        limit,
        durationMs:    result.durationMs,
        triggeredBy:   'manual',
      }),
    })

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
    console.error('[POST /api/content/analyze-new]', message)
    try {
      await supabase.from('automation_runs').insert({
        automation_name: AUTOMATION_NAME,
        status:          'failed',
        result_summary:  JSON.stringify({
          error:         message.slice(0, 500),
          model:         geminiModel,
          promptVersion: PROMPT_VERSION,
          limit,
          triggeredBy:   'manual',
        }),
      })
    } catch {
      // swallow logging failure
    }
    return Response.json({ ok: false, error: message }, { status: 500 })
  } finally {
    inFlight = false
  }
}
