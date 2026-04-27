import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { TStaleOpportunitiesResult } from '@creator-hub/types'
import { logAutomationRun } from '@/features/automations/queries'

export const runtime = 'nodejs'

const AUTOMATION_NAME   = 'opportunity-stale-alert'
const STALE_THRESHOLD_D = 7

type DealStage = Database['public']['Enums']['deal_stage']

const OPEN_STAGES: readonly DealStage[] = [
  'target_identified',
  'outreach_drafted',
  'outreach_sent',
  'opened',
  'replied',
  'concept_shared',
  'negotiation',
  'verbal_yes',
]

/**
 * Flag opportunities with last_activity_at older than STALE_THRESHOLD_D,
 * excluding closed/dormant stages. Creates one "Relancer stale" task per
 * opportunity, idempotent on a 24h window (same pattern as Papermark webhook).
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
    const threshold = new Date(Date.now() - STALE_THRESHOLD_D * 86_400_000).toISOString()
    const since24h  = new Date(Date.now() - 86_400_000).toISOString()

    const { data: stale, error } = await supabase
      .from('opportunities')
      .select('id, name, last_activity_at, stage')
      .lt('last_activity_at', threshold)
      .in('stage', OPEN_STAGES)

    if (error) throw new Error(error.message)

    let tasksCreated       = 0
    let skippedAsDuplicate = 0

    for (const opp of stale ?? []) {
      const { data: recent } = await supabase
        .from('tasks')
        .select('id')
        .eq('linked_opportunity_id', opp.id)
        .eq('status', 'todo')
        .ilike('label', 'Relancer stale%')
        .gte('created_at', since24h)
        .limit(1)

      if (recent && recent.length > 0) {
        skippedAsDuplicate += 1
        continue
      }

      await supabase.from('tasks').insert({
        label:                  `Relancer stale · ${opp.name}`,
        status:                 'todo',
        due_at:                 new Date().toISOString(),
        linked_opportunity_id:  opp.id,
      })
      tasksCreated += 1
    }

    const result: TStaleOpportunitiesResult = {
      staleCount: stale?.length ?? 0,
      tasksCreated,
      skippedAsDuplicate,
    }

    const status = result.staleCount === 0 ? 'skipped' : 'success'
    await logAutomationRun(
      supabase,
      AUTOMATION_NAME,
      status,
      `stale=${result.staleCount} created=${result.tasksCreated} dupes=${result.skippedAsDuplicate}`,
    )

    return Response.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    await logAutomationRun(supabase, AUTOMATION_NAME, 'failed', message.slice(0, 500))
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
