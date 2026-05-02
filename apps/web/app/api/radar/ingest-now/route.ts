// Manual Meme Radar ingest trigger.
// Authenticated route called by the "Refresh Radar" button on
// /content-lab/radar as the first step of the new two-phase workflow.
// Runs only the RSS ingest and returns its summary; scoring is handled
// by separate calls to /api/radar/score-new so the client can chunk the
// work and stop early.
//
// Library-only: no shell-out. Mirrors the in-process inFlight + auth
// pattern used by /api/meta/sync-now and /api/radar/refresh.

import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  RADAR_INGEST_AUTOMATION,
  radarIngestDefaultCutoff,
  runRadarIngest,
} from '@/lib/radar/ingest-batch'
import { logAutomationRun } from '@/lib/radar/persist'

export const runtime = 'nodejs'
export const maxDuration = 300

let inFlight = false

export async function POST(_request: NextRequest) {
  const authClient = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await authClient.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const missing: string[] = []
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length > 0) {
    return Response.json(
      { ok: false, error: `missing_env:${missing.join(',')}` },
      { status: 500 },
    )
  }

  if (inFlight) {
    return Response.json(
      { ok: false, error: 'Radar ingest already running' },
      { status: 409 },
    )
  }

  const supabase = createClient<Database>(supabaseUrl!, supabaseKey!)
  const startedAt = Date.now()

  inFlight = true
  try {
    let ingest
    try {
      ingest = await runRadarIngest({
        supabase,
        cutoff: radarIngestDefaultCutoff(),
        dryRun: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ingest_failed'
      console.error('[POST /api/radar/ingest-now] ingest fatal:', message)
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

    return Response.json({
      ok: true,
      ingest: {
        sourcesProcessed: ingest.totalSources,
        itemsInserted:    ingest.totals.itemsInserted,
        rawInserted:      ingest.totals.rawInserted,
        duplicates:       ingest.totals.duplicates,
        skippedOld:       ingest.totals.skippedOld,
        errors:           ingest.totals.errors,
        noOpReason:       ingest.noOpReason,
      },
      durationMs: Date.now() - startedAt,
    })
  } finally {
    inFlight = false
  }
}
