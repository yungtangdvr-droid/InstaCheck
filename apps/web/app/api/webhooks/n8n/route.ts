import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { AutomationStatus, N8nSyncTriggerPayload } from '@creator-hub/types'
import { logAutomationRun } from '@/features/automations/queries'
import { isAutomationStatus } from '@/features/automations/utils'

export const runtime = 'nodejs'

/**
 * Generic inbound bridge n8n workflows call when they own the logic and only
 * need the hub to record an automation_runs entry. Payload may include an
 * explicit status + summary; otherwise defaults to "success".
 */
type N8nInboundPayload = N8nSyncTriggerPayload & {
  status?:  AutomationStatus
  summary?: string
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey     = process.env.N8N_API_KEY

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: N8nInboundPayload
  try {
    payload = (await request.json()) as N8nInboundPayload
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!payload?.automation || typeof payload.automation !== 'string') {
    return Response.json({ error: 'Missing automation name' }, { status: 400 })
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const status: AutomationStatus = isAutomationStatus(payload.status) ? payload.status : 'success'
  const summary = payload.summary ?? `triggeredAt=${payload.triggeredAt ?? new Date().toISOString()}`

  await logAutomationRun(supabase, payload.automation, status, summary.slice(0, 500))

  return Response.json({ ok: true, received: payload.automation, status })
}
