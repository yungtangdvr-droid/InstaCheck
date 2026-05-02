// Manual Meme Radar refresh trigger (LEGACY — kept for backwards
// compatibility).
//
// Originally wired to the "Refresh Radar" button on /content-lab/radar.
// The button now drives the split flow via /api/radar/ingest-now and
// repeated /api/radar/score-new calls because this single-request
// version was timing out at 504 (RSS ingest + scoring of up to 20 items
// in one HTTP request was too long-running for the platform).
//
// This route is intentionally not deleted: external probes / saved
// curl commands may still target it. The score cap is reduced to 5 so
// it cannot reproduce the original timeout.
//
// Library-only: no shell-out, no CLI invocation. Mirrors the in-process
// inFlight + auth pattern used by /api/meta/sync-now and
// /api/content/analyze-new.

import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  RADAR_INGEST_AUTOMATION,
  radarIngestDefaultCutoff,
  runRadarIngest,
} from '@/lib/radar/ingest-batch'
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

// Best-effort in-process guard. Cold starts reset this, which is fine for
// a single-operator product — it just keeps the same instance from
// running two concurrent refreshes.
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
      { ok: false, error: 'Radar refresh already running' },
      { status: 409 },
    )
  }

  const supabase = createClient<Database>(supabaseUrl!, supabaseKey!)
  const startedAt = Date.now()

  inFlight = true
  try {
    // ----- Step 1: ingest -----
    let ingest
    try {
      ingest = await runRadarIngest({
        supabase,
        cutoff: radarIngestDefaultCutoff(),
        dryRun: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ingest_failed'
      console.error('[POST /api/radar/refresh] ingest fatal:', message)
      try {
        await logAutomationRun(
          supabase,
          'failed',
          { error: message.slice(0, 500), triggeredBy: 'manual' },
          RADAR_INGEST_AUTOMATION,
        )
      } catch {
        // swallow logging failure
      }
      return Response.json({ ok: false, error: message }, { status: 500 })
    }

    const ingestStatus: 'success' | 'failed' | 'skipped' =
      ingest.totalSources === 0 ? 'skipped'
      : ingest.totals.errors > 0 ? 'failed'
      :                            'success'

    try {
      await logAutomationRun(
        supabase,
        ingestStatus,
        {
          ok:           ingest.ok,
          automation:   RADAR_INGEST_AUTOMATION,
          cutoff:       ingest.cutoff,
          totalSources: ingest.totalSources,
          totals:       ingest.totals,
          perSource:    ingest.perSource,
          durationMs:   ingest.durationMs,
          noOpReason:   ingest.noOpReason,
          triggeredBy:  'manual',
        },
        RADAR_INGEST_AUTOMATION,
      )
    } catch {
      // non-fatal
    }

    // ----- Step 2: score -----
    // A failure inside scoring is reported as partial success (HTTP 200)
    // — the ingest itself already succeeded by this point.
    let scoreOk     = true
    let scoreError: string | null = null
    let scoreResult: Awaited<ReturnType<typeof runRadarScoreBatch>> | null = null

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
      scoreOk    = false
      scoreError = err instanceof Error ? err.message : 'score_failed'
      console.error('[POST /api/radar/refresh] score fatal:', scoreError)
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
    }

    const partial = !scoreOk || (scoreResult ? scoreResult.failed > 0 : false) || ingest.totals.errors > 0

    return Response.json({
      ok:         true,
      partial,
      ingest: {
        sourcesProcessed: ingest.totalSources,
        itemsInserted:    ingest.totals.itemsInserted,
        rawInserted:      ingest.totals.rawInserted,
        duplicates:       ingest.totals.duplicates,
        skippedOld:       ingest.totals.skippedOld,
        errors:           ingest.totals.errors,
        noOpReason:       ingest.noOpReason,
      },
      score: scoreResult
        ? {
            scoreCap:       SCORE_LIMIT,
            candidateCount: scoreResult.candidates.length,
            processed:      scoreResult.processed,
            completed:      scoreResult.completed,
            failed:         scoreResult.failed,
            skipped:        scoreResult.skipped,
            providerCounts: scoreResult.providerCounts,
            noOpReason:     scoreResult.noOpReason,
            error:          null,
          }
        : {
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
    })
  } finally {
    inFlight = false
  }
}
