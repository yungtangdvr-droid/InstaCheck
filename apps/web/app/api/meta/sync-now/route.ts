import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { runFullSync } from '@/lib/meta/index'
import type { Database } from '@creator-hub/types/supabase'

export const runtime = 'nodejs'
export const maxDuration = 300

// Best-effort in-process guard against double-clicks. Serverless cold starts
// reset this, so it's not a true distributed lock — just a cheap safety net
// against a single tab firing two requests in the same instance.
let inFlight = false

const AUTOMATION_NAME = 'daily-instagram-sync'
const RECENT_RUN_WINDOW_MS = 30_000

export async function POST(_request: NextRequest) {
  const authClient = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await authClient.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const igUserId    = process.env.META_INSTAGRAM_ACCOUNT_ID
  const accessToken = process.env.META_ACCESS_TOKEN
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!igUserId || !accessToken || !supabaseUrl || !supabaseKey) {
    return Response.json({ error: 'Server is missing Meta or Supabase env vars' }, { status: 500 })
  }

  if (inFlight) {
    return Response.json(
      { error: 'Sync already running', message: 'Une synchronisation est déjà en cours.' },
      { status: 409 },
    )
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey)

  // Cheap throttle: if the last logged run started < 30s ago, refuse. Reuses
  // the same automation_runs row daily-instagram-sync writes from cron.
  const { data: latestRun } = await supabase
    .from('automation_runs')
    .select('ran_at')
    .eq('automation_name', AUTOMATION_NAME)
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestRun?.ran_at) {
    const sinceMs = Date.now() - new Date(latestRun.ran_at).getTime()
    if (Number.isFinite(sinceMs) && sinceMs >= 0 && sinceMs < RECENT_RUN_WINDOW_MS) {
      return Response.json(
        {
          error: 'Sync ran very recently',
          message: 'Une synchronisation vient de se terminer. Réessaie dans quelques secondes.',
        },
        { status: 429 },
      )
    }
  }

  inFlight = true
  try {
    const result = await runFullSync({ supabaseUrl, supabaseKey, igUserId, accessToken })

    await supabase.from('automation_runs').insert({
      automation_name: AUTOMATION_NAME,
      status:          result.errors.length === 0 ? 'success' : 'failed',
      result_summary:  JSON.stringify({
        account:      result.account,
        media:        result.media,
        insights:     { count: result.insights.length },
        demographics: result.demographics,
        errors:       result.errors,
        durationMs:   result.durationMs,
        triggeredBy:  'manual',
      }),
    })

    return Response.json({
      ok:         result.errors.length === 0,
      result: {
        account:      result.account,
        media:        result.media,
        insights:     { count: result.insights.length },
        demographics: result.demographics,
      },
      durationMs: result.durationMs,
      errors:     result.errors,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[POST /api/meta/sync-now]', message)

    try {
      await supabase.from('automation_runs').insert({
        automation_name: AUTOMATION_NAME,
        status:          'failed',
        result_summary:  message,
      })
    } catch {
      // swallow logging error
    }

    return Response.json({ ok: false, error: message }, { status: 500 })
  } finally {
    inFlight = false
  }
}
