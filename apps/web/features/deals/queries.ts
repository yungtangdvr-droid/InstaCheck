import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type {
  DealStage,
  Opportunity,
  OpportunityListRow,
  OpportunityStageEvent,
  Task,
} from '@creator-hub/types'
import { isDealStage } from './utils'

type Supabase = SupabaseClient<Database>

function mapOpportunity(row: Database['public']['Tables']['opportunities']['Row']): Opportunity {
  return {
    id:              row.id,
    name:            row.name,
    brandId:         row.brand_id ?? undefined,
    contactId:       row.contact_id ?? undefined,
    collabType:      row.collab_type ?? undefined,
    estimatedValue:  row.estimated_value ?? undefined,
    currency:        row.currency,
    stage:           isDealStage(row.stage) ? row.stage : 'target_identified',
    probability:     row.probability,
    expectedCloseAt: row.expected_close_at ?? undefined,
    lastActivityAt:  row.last_activity_at ?? undefined,
    nextAction:      row.next_action ?? undefined,
    deckId:          row.deck_id ?? undefined,
  }
}

function mapStageEvent(
  row: Database['public']['Tables']['opportunity_stage_history']['Row'],
): OpportunityStageEvent {
  return {
    id:            row.id,
    opportunityId: row.opportunity_id,
    stage:         isDealStage(row.stage) ? row.stage : 'target_identified',
    changedAt:     row.changed_at,
  }
}

function mapTask(row: Database['public']['Tables']['tasks']['Row']): Task {
  return {
    id:                  row.id,
    label:               row.label,
    status:              row.status as Task['status'],
    dueAt:               row.due_at ?? undefined,
    linkedBrandId:       row.linked_brand_id ?? undefined,
    linkedOpportunityId: row.linked_opportunity_id ?? undefined,
    linkedContactId:     row.linked_contact_id ?? undefined,
    createdAt:           row.created_at,
  }
}

export async function listOpportunities(
  supabase: Supabase,
  filter?: { brandId?: string },
): Promise<OpportunityListRow[]> {
  let q = supabase
    .from('opportunities')
    .select('*')
    .order('last_activity_at', { ascending: false, nullsFirst: false })

  if (filter?.brandId) q = q.eq('brand_id', filter.brandId)

  const { data: opps } = await q
  if (!opps || opps.length === 0) return []

  const ids        = opps.map((o) => o.id)
  const brandIds   = Array.from(new Set(opps.map((o) => o.brand_id).filter((v): v is string => !!v)))
  const contactIds = Array.from(new Set(opps.map((o) => o.contact_id).filter((v): v is string => !!v)))

  const [brandsRes, contactsRes, tasksRes] = await Promise.all([
    brandIds.length
      ? supabase.from('brands').select('id, name').in('id', brandIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    contactIds.length
      ? supabase.from('contacts').select('id, full_name').in('id', contactIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    supabase
      .from('tasks')
      .select('linked_opportunity_id, status')
      .in('linked_opportunity_id', ids)
      .neq('status', 'done'),
  ])

  const brandNames   = new Map<string, string>()
  const contactNames = new Map<string, string>()
  const openTasks    = new Map<string, number>()

  for (const b of brandsRes.data ?? []) brandNames.set(b.id, b.name)
  for (const c of contactsRes.data ?? []) contactNames.set(c.id, c.full_name)
  for (const t of tasksRes.data ?? []) {
    if (!t.linked_opportunity_id) continue
    openTasks.set(
      t.linked_opportunity_id,
      (openTasks.get(t.linked_opportunity_id) ?? 0) + 1,
    )
  }

  return opps.map((row) => {
    const opp = mapOpportunity(row)
    return {
      ...opp,
      brandName:      opp.brandId   ? brandNames.get(opp.brandId)   ?? null : null,
      contactName:    opp.contactId ? contactNames.get(opp.contactId) ?? null : null,
      openTasksCount: openTasks.get(opp.id) ?? 0,
      hasDeck:        !!opp.deckId,
    }
  })
}

export function groupByStage(rows: OpportunityListRow[]): Record<DealStage, OpportunityListRow[]> {
  const empty = {
    target_identified: [],
    outreach_drafted:  [],
    outreach_sent:     [],
    opened:            [],
    replied:           [],
    concept_shared:    [],
    negotiation:       [],
    verbal_yes:        [],
    won:               [],
    lost:              [],
    dormant:           [],
  } as Record<DealStage, OpportunityListRow[]>

  for (const row of rows) empty[row.stage].push(row)
  return empty
}

export async function getOpportunity(supabase: Supabase, id: string): Promise<Opportunity | null> {
  const { data } = await supabase.from('opportunities').select('*').eq('id', id).maybeSingle()
  return data ? mapOpportunity(data) : null
}

export async function getOpportunityStageHistory(
  supabase: Supabase,
  opportunityId: string,
): Promise<OpportunityStageEvent[]> {
  const { data } = await supabase
    .from('opportunity_stage_history')
    .select('*')
    .eq('opportunity_id', opportunityId)
    .order('changed_at', { ascending: false })
    .limit(100)
  return (data ?? []).map(mapStageEvent)
}

export async function getOpportunityTasks(
  supabase: Supabase,
  opportunityId: string,
): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('linked_opportunity_id', opportunityId)
    .neq('status', 'done')
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
  return (data ?? []).map(mapTask)
}

export async function listBrandOptions(
  supabase: Supabase,
): Promise<Array<{ id: string; name: string }>> {
  const { data } = await supabase
    .from('brands')
    .select('id, name')
    .order('name', { ascending: true })
  return data ?? []
}

export async function getBrandName(
  supabase: Supabase,
  id: string,
): Promise<string | null> {
  const { data } = await supabase.from('brands').select('name').eq('id', id).maybeSingle()
  return data?.name ?? null
}

export async function getContactName(
  supabase: Supabase,
  id: string,
): Promise<string | null> {
  const { data } = await supabase.from('contacts').select('full_name').eq('id', id).maybeSingle()
  return data?.full_name ?? null
}

export async function getAssetName(
  supabase: Supabase,
  id: string,
): Promise<string | null> {
  const { data } = await supabase.from('assets').select('name').eq('id', id).maybeSingle()
  return data?.name ?? null
}
