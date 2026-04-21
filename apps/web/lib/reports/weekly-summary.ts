import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { TWeeklyReportResult } from '@creator-hub/types'
import { addDays, isoWeekStart } from '@/features/automations/utils'

type Supabase = SupabaseClient<Database>

async function sumReachSaves(
  supabase: Supabase,
  fromIso: string,
  toIso: string,
): Promise<{ reach: number; saves: number }> {
  // date column is DATE; comparing with ISO date prefix is safe.
  const from = fromIso.slice(0, 10)
  const to   = toIso.slice(0, 10)

  const { data } = await supabase
    .from('post_metrics_daily')
    .select('reach, saves, date')
    .gte('date', from)
    .lt('date',  to)

  let reach = 0
  let saves = 0
  for (const r of data ?? []) {
    reach += r.reach ?? 0
    saves += r.saves ?? 0
  }
  return { reach, saves }
}

async function countRows(
  supabase: Supabase,
  table:    'brands' | 'opportunity_stage_history' | 'asset_events',
  column:   'created_at' | 'changed_at' | 'occurred_at',
  fromIso:  string,
  toIso:    string,
  eq?:      { col: string; val: string },
): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true })
    .gte(column, fromIso)
    .lt(column,  toIso)
  if (eq) q = q.eq(eq.col, eq.val)
  const { count } = await q
  return count ?? 0
}

/**
 * Compute the weekly summary for the ISO week that contains `anchor`.
 * Deltas are current-week minus prior-week totals of reach / saves, using
 * post_metrics_daily. Counts are plain within-week counts for new_leads,
 * deals_moved, deck_opens.
 */
export async function computeWeeklySummary(
  supabase: Supabase,
  anchor: Date = new Date(),
): Promise<TWeeklyReportResult & { __prevReach: number; __prevSaves: number }> {
  const weekStart     = isoWeekStart(anchor)
  const nextWeekStart = addDays(weekStart, 7)
  const prevWeekStart = addDays(weekStart, -7)

  const weekStartIso     = weekStart.toISOString()
  const nextWeekStartIso = nextWeekStart.toISOString()
  const prevWeekStartIso = prevWeekStart.toISOString()

  const [curr, prev, newLeads, dealsMoved, deckOpens] = await Promise.all([
    sumReachSaves(supabase, weekStartIso,     nextWeekStartIso),
    sumReachSaves(supabase, prevWeekStartIso, weekStartIso),
    countRows(supabase, 'brands',                    'created_at', weekStartIso, nextWeekStartIso),
    countRows(supabase, 'opportunity_stage_history', 'changed_at', weekStartIso, nextWeekStartIso),
    countRows(supabase, 'asset_events',              'occurred_at', weekStartIso, nextWeekStartIso,
      { col: 'event_type', val: 'opened' }),
  ])

  const reachDelta = curr.reach - prev.reach
  const savesDelta = curr.saves - prev.saves

  return {
    weekStart:  weekStart.toISOString().slice(0, 10),
    reachDelta,
    savesDelta,
    newLeads,
    dealsMoved,
    deckOpens,
    upserted:   false,
    __prevReach: prev.reach,
    __prevSaves: prev.saves,
  }
}

export async function upsertWeeklySummary(
  supabase: Supabase,
  anchor: Date = new Date(),
): Promise<TWeeklyReportResult> {
  const computed = await computeWeeklySummary(supabase, anchor)

  const { error } = await supabase.from('weekly_summaries').upsert(
    {
      week_start:   computed.weekStart,
      reach_delta:  computed.reachDelta,
      saves_delta:  computed.savesDelta,
      new_leads:    computed.newLeads,
      deals_moved:  computed.dealsMoved,
      deck_opens:   computed.deckOpens,
    },
    { onConflict: 'week_start' },
  )

  if (error) throw new Error(error.message)

  return {
    weekStart:   computed.weekStart,
    reachDelta:  computed.reachDelta,
    savesDelta:  computed.savesDelta,
    newLeads:    computed.newLeads,
    dealsMoved:  computed.dealsMoved,
    deckOpens:   computed.deckOpens,
    upserted:    true,
  }
}
