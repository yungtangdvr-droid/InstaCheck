// Manual Meme Radar score chunk.
// Authenticated route called by the "Refresh Radar" button on
// /content-lab/radar after /api/radar/ingest-now. Each call scores up
// to SCORE_LIMIT (hard cap 5) new items; the client loops the route to
// drain the backlog and stops early when there is nothing left.

import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_MODEL,
  runRadarScoreBatch,
} from '@/lib/radar/score-batch'
import {
  RADAR_SCORE_AUTOMATION,
  logAutomationRun,
} from '@/lib/radar/persist'

export const runtime = 'nodejs'
export const maxDuration = 300

const SCORE_LIMIT     = 5
const SCORE_WINDOW_HR = 48

let inFlight = false

function scoreSinceIso(now: Date = new Date()): string {
  const d = new Date(now)
  d.setUTCHours(d.getUTCHours() - SCORE_WINDOW_HR)
  return d.toISOString()
}

export async function POST(_request: NextRequest) {
  const authClient = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await authClient.auth.getUser()

  if (authError || !user) {
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

  if (inFlight) {
    return Response.json(
      { ok: false, error: 'Radar score already running' },
      { status: 409 },
    )
  }

  const supabase = createClient<Database>(supabaseUrl!, supabaseKey!)
  const startedAt = Date.now()

  inFlight = true
  try {
    let scoreResult: Awaited<ReturnType<typeof runRadarScoreBatch>> | null = null
    let scoreError: string | null = null

    try {
      scoreResult = await runRadarScoreBatch({
        supabase,
        since:     scoreSinceIso(),
        limit:     SCORE_LIMIT,
        reanalyze: false,
        dryRun:    false,
        ctx: {
          geminiKey:             geminiKey!,
          geminiModel,
          openaiKey:             openaiFallbackEnabled ? (openaiKeyRaw ?? null) : null,
          openaiModel,
          openaiFallbackEnabled,
        },
      })
    } catch (err) {
      scoreError = err instanceof Error ? err.message : 'score_failed'
      console.error('[POST /api/radar/score-new] score fatal:', scoreError)
    }

    if (scoreResult) {
      const status: 'success' | 'failed' | 'skipped' =
        scoreResult.candidates.length === 0 ? 'skipped'
        : scoreResult.failed > 0            ? 'failed'
        :                                     'success'
      try {
        await logAutomationRun(
          supabase,
          status,
          {
            ok:                    scoreResult.failed === 0,
            automation:            RADAR_SCORE_AUTOMATION,
            promptVersion:         scoreResult.promptVersion,
            limit:                 SCORE_LIMIT,
            candidateCount:        scoreResult.candidates.length,
            processed:             scoreResult.processed,
            completed:             scoreResult.completed,
            failed:                scoreResult.failed,
            skipped:               scoreResult.skipped,
            providerCounts:        scoreResult.providerCounts,
            openaiFallbackEnabled,
            noOpReason:            scoreResult.noOpReason,
            durationMs:            scoreResult.durationMs,
            triggeredBy:           'manual',
          },
          RADAR_SCORE_AUTOMATION,
        )
      } catch {
        // non-fatal
      }
    } else {
      try {
        await logAutomationRun(
          supabase,
          'failed',
          {
            error:        (scoreError ?? 'score_failed').slice(0, 500),
            limit:        SCORE_LIMIT,
            triggeredBy:  'manual',
          },
          RADAR_SCORE_AUTOMATION,
        )
      } catch {
        // non-fatal
      }

      return Response.json(
        {
          ok:    false,
          error: scoreError ?? 'score_failed',
          score: {
            scoreCap:       SCORE_LIMIT,
            candidateCount: 0,
            processed:      0,
            completed:      0,
            failed:         0,
            skipped:        0,
            providerCounts: { gemini: 0, openai: 0 },
            noOpReason:     null,
            error:          scoreError,
          },
          durationMs: Date.now() - startedAt,
        },
        { status: 500 },
      )
    }

    return Response.json({
      ok:      true,
      partial: scoreResult.failed > 0,
      score: {
        scoreCap:       SCORE_LIMIT,
        candidateCount: scoreResult.candidates.length,
        processed:      scoreResult.processed,
        completed:      scoreResult.completed,
        failed:         scoreResult.failed,
        skipped:        scoreResult.skipped,
        providerCounts: scoreResult.providerCounts,
        noOpReason:     scoreResult.noOpReason,
        error:          null,
      },
      durationMs: Date.now() - startedAt,
    })
  } finally {
    inFlight = false
  }
}
