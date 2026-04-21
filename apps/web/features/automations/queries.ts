import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type {
  AutomationRun,
  AutomationStatus,
  AutomationSummary,
  WeeklySummary,
} from '@creator-hub/types'
import { CANONICAL_AUTOMATIONS } from '@creator-hub/types'
import { daysAgoIso, isAutomationStatus, isCanonicalAutomation } from './utils'

type Supabase = SupabaseClient<Database>
type RunRow   = Database['public']['Tables']['automation_runs']['Row']
type WeekRow  = Database['public']['Tables']['weekly_summaries']['Row']

function mapRun(row: RunRow): AutomationRun {
  return {
    id:             row.id,
    automationName: row.automation_name,
    status:         isAutomationStatus(row.status) ? row.status : 'skipped',
    resultSummary:  row.result_summary,
    ranAt:          row.ran_at,
  }
}

function mapWeek(row: WeekRow): WeeklySummary {
  return {
    id:          row.id,
    weekStart:   row.week_start,
    reachDelta:  row.reach_delta,
    savesDelta:  row.saves_delta,
    newLeads:    row.new_leads,
    dealsMoved:  row.deals_moved,
    deckOpens:   row.deck_opens,
    createdAt:   row.created_at,
  }
}

/**
 * Build one AutomationSummary per canonical name + every extra name observed
 * in automation_runs. Canonical names always appear even with zero runs,
 * so the UI exposes "never run" states (e.g. brand-watch-digest until Sprint 9).
 */
export async function getAutomationSummaries(supabase: Supabase): Promise<AutomationSummary[]> {
  const since = daysAgoIso(7)

  const [recentRes, lastRes] = await Promise.all([
    supabase
      .from('automation_runs')
      .select('automation_name, status, ran_at')
      .gte('ran_at', since),
    supabase
      .from('automation_runs')
      .select('*')
      .order('ran_at', { ascending: false })
      .limit(500),
  ])

  const recent = recentRes.data ?? []
  const recentByName = new Map<string, { success: number; failed: number; skipped: number }>()
  for (const r of recent) {
    const bucket = recentByName.get(r.automation_name) ?? { success: 0, failed: 0, skipped: 0 }
    if (r.status === 'success')      bucket.success += 1
    else if (r.status === 'failed')  bucket.failed  += 1
    else if (r.status === 'skipped') bucket.skipped += 1
    recentByName.set(r.automation_name, bucket)
  }

  const lastRuns = (lastRes.data ?? []).map(mapRun)
  const firstByName        = new Map<string, AutomationRun>()
  const firstSuccessByName = new Map<string, AutomationRun>()
  const firstFailureByName = new Map<string, AutomationRun>()
  for (const run of lastRuns) {
    if (!firstByName.has(run.automationName)) firstByName.set(run.automationName, run)
    if (run.status === 'success' && !firstSuccessByName.has(run.automationName)) {
      firstSuccessByName.set(run.automationName, run)
    }
    if (run.status === 'failed' && !firstFailureByName.has(run.automationName)) {
      firstFailureByName.set(run.automationName, run)
    }
  }

  const observedNames = new Set<string>([...firstByName.keys(), ...recentByName.keys()])
  const allNames      = new Set<string>([...CANONICAL_AUTOMATIONS, ...observedNames])

  const summaries: AutomationSummary[] = Array.from(allNames).map((name) => ({
    name,
    canonical:   isCanonicalAutomation(name),
    lastRun:     firstByName.get(name)        ?? null,
    lastSuccess: firstSuccessByName.get(name) ?? null,
    lastFailure: firstFailureByName.get(name) ?? null,
    runs7d:      recentByName.get(name)       ?? { success: 0, failed: 0, skipped: 0 },
  }))

  // Canonical first (in declared order), then observed extras alphabetically.
  const canonicalOrder = new Map(CANONICAL_AUTOMATIONS.map((n, i) => [n as string, i]))
  summaries.sort((a, b) => {
    if (a.canonical && b.canonical) {
      return (canonicalOrder.get(a.name) ?? 0) - (canonicalOrder.get(b.name) ?? 0)
    }
    if (a.canonical) return -1
    if (b.canonical) return 1
    return a.name.localeCompare(b.name)
  })

  return summaries
}

export async function listRuns(
  supabase: Supabase,
  automationName: string,
  limit = 50,
): Promise<AutomationRun[]> {
  const { data } = await supabase
    .from('automation_runs')
    .select('*')
    .eq('automation_name', automationName)
    .order('ran_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map(mapRun)
}

export async function listRecentWeeklySummaries(
  supabase: Supabase,
  limit = 4,
): Promise<WeeklySummary[]> {
  const { data } = await supabase
    .from('weekly_summaries')
    .select('*')
    .order('week_start', { ascending: false })
    .limit(limit)
  return (data ?? []).map(mapWeek)
}

/**
 * Insert a row into automation_runs. Used by every automation endpoint.
 * Never throws — logging failures should not mask the underlying result.
 */
export async function logAutomationRun(
  supabase: Supabase,
  automationName: string,
  status: AutomationStatus,
  resultSummary: string | null,
): Promise<void> {
  try {
    await supabase.from('automation_runs').insert({
      automation_name: automationName,
      status,
      result_summary:  resultSummary,
    })
  } catch (err) {
    console.error('[logAutomationRun]', automationName, err)
  }
}
