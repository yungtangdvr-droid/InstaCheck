import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { TBrandWatchDigestResult } from '@creator-hub/types'
import { logAutomationRun } from '@/features/automations/queries'
import { buildReviewQueue } from '@/features/brand-watch/queries'

export const runtime = 'nodejs'

const AUTOMATION_NAME = 'brand-watch-digest'
const WINDOW_DAYS     = 7  // digest covers the week since last CRON fire

/**
 * Friday 08:00 UTC digest. n8n calls this endpoint, we compute the review-queue
 * summary over the last WINDOW_DAYS, and log the run in automation_runs.
 *
 * This route does NOT send the digest email itself — n8n handles delivery
 * downstream based on its own channels.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey     = process.env.N8N_API_KEY
  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    const { summary } = await buildReviewQueue(supabase, WINDOW_DAYS)

    const result: TBrandWatchDigestResult = {
      windowDays:      summary.windowDays,
      totalEvents:     summary.totalEvents,
      matchedEvents:   summary.matchedEvents,
      ambiguousEvents: summary.ambiguousEvents,
      unmatchedEvents: summary.unmatchedEvents,
      activeWatches:   summary.activeWatches,
    }

    const status = result.totalEvents === 0 ? 'skipped' : 'success'
    const resultSummary =
      `window=${result.windowDays}d ` +
      `total=${result.totalEvents} ` +
      `matched=${result.matchedEvents} ` +
      `ambiguous=${result.ambiguousEvents} ` +
      `unmatched=${result.unmatchedEvents} ` +
      `active=${result.activeWatches}`

    await logAutomationRun(supabase, AUTOMATION_NAME, status, resultSummary.slice(0, 500))

    return Response.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    await logAutomationRun(supabase, AUTOMATION_NAME, 'failed', message.slice(0, 500))
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
