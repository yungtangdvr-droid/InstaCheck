// Meme Briefs — protected batch generation endpoint.
//
// Bearer-authenticated (mirrors /api/automations/*). Selects up to
// BRIEF_HARD_CAP radar items (preferring `decision='saved'`), runs
// the Gemini → OpenAI fallback brief pipeline, and persists each
// brief to `meme_briefs`. Synchronous within the request — the
// caller is responsible for keeping the limit modest.

import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

import {
  BRIEF_HARD_CAP,
  DEFAULT_BRIEF_LIMIT,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_MODEL,
  runBriefBatch,
} from '@/lib/briefs/generate-batch'
import { BRIEFS_AUTOMATION } from '@/lib/briefs/persist'
import { logAutomationRun } from '@/lib/radar/persist'

export const runtime = 'nodejs'
export const maxDuration = 300

let inFlight = false

type RequestBody = {
  limit?:           number
  radarItemId?:     string
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey     = process.env.N8N_API_KEY
  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
  if (!geminiKey)   missing.push('GEMINI_API_KEY')
  if (openaiFallbackEnabled && !openaiKeyRaw) missing.push('OPENAI_API_KEY')
  if (missing.length > 0) {
    return Response.json(
      { ok: false, error: `missing_env:${missing.join(',')}` },
      { status: 500 },
    )
  }

  let body: RequestBody = {}
  try {
    const raw = await request.text()
    if (raw.trim().length > 0) body = JSON.parse(raw) as RequestBody
  } catch {
    // empty body is fine
  }

  const requestedLimit = typeof body.limit === 'number' && Number.isFinite(body.limit)
    ? Math.round(body.limit)
    : DEFAULT_BRIEF_LIMIT
  const limit = Math.max(1, Math.min(requestedLimit, BRIEF_HARD_CAP))

  const explicitItemId = typeof body.radarItemId === 'string' && body.radarItemId.length > 0
    ? body.radarItemId
    : null

  if (inFlight) {
    return Response.json(
      { ok: false, error: 'Brief generation already running' },
      { status: 409 },
    )
  }

  const supabase = createClient<Database>(supabaseUrl!, supabaseKey!)
  const start    = Date.now()

  inFlight = true
  try {
    const result = await runBriefBatch({
      supabase,
      limit,
      explicitItemId,
      ctx: {
        geminiKey:             geminiKey!,
        geminiModel,
        openaiKey:             openaiFallbackEnabled ? (openaiKeyRaw ?? null) : null,
        openaiModel,
        openaiFallbackEnabled,
      },
    })

    const status: 'success' | 'failed' | 'skipped' =
      result.candidates.length === 0 ? 'skipped'
      : result.failed > 0            ? 'failed'
      :                                'success'

    try {
      await logAutomationRun(
        supabase,
        status,
        {
          ok:               result.failed === 0,
          automation:       BRIEFS_AUTOMATION,
          promptVersion:    result.promptVersion,
          limit,
          explicitItemId,
          candidateCount:   result.candidates.length,
          processed:        result.processed,
          completed:        result.completed,
          failed:           result.failed,
          qualityGuard:     result.qualityGuard,
          providerCounts:   result.providerCounts,
          noOpReason:       result.noOpReason,
          durationMs:       result.durationMs,
          triggeredBy:      'api',
        },
        BRIEFS_AUTOMATION,
      )
    } catch {
      // non-fatal
    }

    return Response.json({
      ok:             true,
      partial:        result.failed > 0 || result.qualityGuard > 0,
      limit,
      candidateCount: result.candidates.length,
      processed:      result.processed,
      completed:      result.completed,
      failed:         result.failed,
      qualityGuard:   result.qualityGuard,
      providerCounts: result.providerCounts,
      noOpReason:     result.noOpReason,
      promptVersion:  result.promptVersion,
      durationMs:     Date.now() - start,
      outcomes:       result.outcomes.map((o) => ({
        radarItemId: o.radarItemId,
        briefId:     o.briefId,
        title:       o.title,
        status:      o.status,
        provider:    o.provider,
        error:       o.error,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'brief_batch_failed'
    try {
      await logAutomationRun(
        supabase,
        'failed',
        { error: message.slice(0, 500), limit, explicitItemId, triggeredBy: 'api' },
        BRIEFS_AUTOMATION,
      )
    } catch {
      // non-fatal
    }
    return Response.json({ ok: false, error: message }, { status: 500 })
  } finally {
    inFlight = false
  }
}
