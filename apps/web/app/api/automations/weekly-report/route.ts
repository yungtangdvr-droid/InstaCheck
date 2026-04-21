import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { TWeeklyReportInput } from '@creator-hub/types'
import { upsertWeeklySummary } from '@/lib/reports/weekly-summary'
import { logAutomationRun } from '@/features/automations/queries'

export const runtime = 'nodejs'

const AUTOMATION_NAME = 'weekly-creator-report'

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

  let anchor = new Date()
  try {
    const raw = await request.text()
    if (raw.trim().length > 0) {
      const payload = JSON.parse(raw) as TWeeklyReportInput
      if (payload.weekStart) {
        const parsed = new Date(payload.weekStart)
        if (!Number.isNaN(parsed.getTime())) anchor = parsed
      }
    }
  } catch {
    // ignore — empty body is valid, defaults to current ISO week
  }

  const start = Date.now()
  try {
    const result = await upsertWeeklySummary(supabase, anchor)
    const summary =
      `week=${result.weekStart} reachΔ=${result.reachDelta} savesΔ=${result.savesDelta} ` +
      `newLeads=${result.newLeads} dealsMoved=${result.dealsMoved} deckOpens=${result.deckOpens} ` +
      `duration=${Date.now() - start}ms`
    await logAutomationRun(supabase, AUTOMATION_NAME, 'success', summary)
    return Response.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    await logAutomationRun(supabase, AUTOMATION_NAME, 'failed', message.slice(0, 500))
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
