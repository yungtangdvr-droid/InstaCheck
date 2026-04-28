import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runFullSync } from '@/lib/meta/index'
import type { Database } from '@creator-hub/types/supabase'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expectedKey = process.env.N8N_API_KEY

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const igUserId    = process.env.META_INSTAGRAM_ACCOUNT_ID
  const accessToken = process.env.META_ACCESS_TOKEN
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!igUserId || !accessToken || !supabaseUrl || !supabaseKey) {
    return Response.json({ error: 'Missing env variables' }, { status: 500 })
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey)
  const automationName = 'daily-instagram-sync'

  try {
    const result = await runFullSync({ supabaseUrl, supabaseKey, igUserId, accessToken })

    await supabase.from('automation_runs').insert({
      automation_name: automationName,
      status:          result.errors.length === 0 ? 'success' : 'failed',
      result_summary:  JSON.stringify({
        account:      result.account,
        media:        result.media,
        insights:     { count: result.insights.length },
        demographics: result.demographics,
        errors:       result.errors,
        durationMs:   result.durationMs,
      }),
    })

    return Response.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[POST /api/meta/sync]', message)

    try {
      await supabase.from('automation_runs').insert({
        automation_name: automationName,
        status:          'failed',
        result_summary:  message,
      })
    } catch {
      // swallow logging error
    }

    return Response.json({ error: message }, { status: 500 })
  }
}
