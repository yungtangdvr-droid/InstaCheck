import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { TUmamiSyncSummary } from '@creator-hub/types'
import { umamiConfigFromEnv } from '@/lib/umami/umami-client'
import { syncUmamiEvents } from '@/lib/umami/sync-events'
import { resolveAttribution } from '@/lib/umami/resolve-attribution'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey     = process.env.N8N_API_KEY
  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = umamiConfigFromEnv()
  if (!config) {
    return Response.json(
      { error: 'Umami env missing: UMAMI_API_URL, UMAMI_API_KEY, UMAMI_WEBSITE_ID' },
      { status: 500 },
    )
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const start = Date.now()
  try {
    const fetchOutcome   = await syncUmamiEvents(supabase, config)
    const resolveOutcome = await resolveAttribution(supabase)

    const summary: TUmamiSyncSummary = {
      fetched:     fetchOutcome.fetched,
      inserted:    fetchOutcome.inserted,
      resolved:    resolveOutcome.resolved,
      ambiguous:   resolveOutcome.ambiguous,
      windowStart: fetchOutcome.windowStart,
      windowEnd:   fetchOutcome.windowEnd,
      durationMs:  Date.now() - start,
    }

    await supabase.from('automation_runs').insert({
      automation_name: 'umami-sync',
      status:          'success',
      result_summary:
        `fetched=${summary.fetched} inserted=${summary.inserted} ` +
        `resolved=${summary.resolved} ambiguous=${summary.ambiguous} ` +
        `duration=${summary.durationMs}ms`,
    })

    return Response.json({ ok: true, summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    await supabase.from('automation_runs').insert({
      automation_name: 'umami-sync',
      status:          'failed',
      result_summary:  message.slice(0, 500),
    })
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
