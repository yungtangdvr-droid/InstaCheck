// Authenticated POST route the n8n `scoring-refresh` workflow calls after
// the dbt run. Reads v_post_intelligence_candidates, generates French
// sentences via build-reason.ts, and INSERTs new content_recommendations
// rows when no identical (post_id, type, reason) row exists in the last
// DEDUPE_DAYS days. Never deletes, never updates existing rows. Mirrors
// the auth + automation_runs logging pattern of /api/webhooks/n8n.

import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import { logAutomationRun } from '@/features/automations/queries'
import { refreshContentRecommendations } from '@/features/content-lab/intelligence/refresh-recommendations'

export const runtime = 'nodejs'
export const maxDuration = 60

const AUTOMATION_NAME = 'content-recommendations-refresh'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey     = process.env.N8N_API_KEY

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return Response.json(
      { ok: false, error: 'missing_env:NEXT_PUBLIC_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 },
    )
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey)

  try {
    const summary = await refreshContentRecommendations(supabase)

    await logAutomationRun(
      supabase,
      AUTOMATION_NAME,
      'success',
      JSON.stringify({
        candidatesFetched: summary.candidatesFetched,
        inserted:          summary.inserted,
        skippedDuplicate:  summary.skippedDuplicate,
        skippedInvalid:    summary.skippedInvalid,
      }).slice(0, 500),
    )

    return Response.json({ ok: true, ...summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error'
    console.error('[POST /api/content/refresh-recommendations]', message)
    await logAutomationRun(
      supabase,
      AUTOMATION_NAME,
      'failed',
      message.slice(0, 500),
    )
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
