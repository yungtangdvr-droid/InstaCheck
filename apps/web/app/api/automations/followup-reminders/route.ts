import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { TFollowupRemindersResult } from '@creator-hub/types'
import { logAutomationRun } from '@/features/automations/queries'

export const runtime = 'nodejs'

const AUTOMATION_NAME = 'followup-reminder'

/**
 * Returns tasks due today (UTC). n8n owns the formatting + delivery channel;
 * the hub only exposes the queryable snapshot.
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
    const now         = new Date()
    const startOfDay  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const startOfNext = new Date(startOfDay.getTime() + 86_400_000)

    const { data, error } = await supabase
      .from('tasks')
      .select('id, label, due_at, linked_brand_id, linked_opportunity_id, linked_contact_id')
      .eq('status', 'todo')
      .gte('due_at', startOfDay.toISOString())
      .lt('due_at',  startOfNext.toISOString())
      .order('due_at', { ascending: true })

    if (error) throw new Error(error.message)

    const result: TFollowupRemindersResult = {
      dueToday: (data ?? []).map((r) => ({
        id:                  r.id,
        label:               r.label,
        dueAt:               r.due_at,
        linkedBrandId:       r.linked_brand_id,
        linkedOpportunityId: r.linked_opportunity_id,
        linkedContactId:     r.linked_contact_id,
      })),
    }

    const status = result.dueToday.length === 0 ? 'skipped' : 'success'
    await logAutomationRun(
      supabase,
      AUTOMATION_NAME,
      status,
      `dueToday=${result.dueToday.length}`,
    )

    return Response.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    await logAutomationRun(supabase, AUTOMATION_NAME, 'failed', message.slice(0, 500))
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
