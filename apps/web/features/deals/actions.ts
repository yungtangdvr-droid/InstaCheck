'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@creator-hub/types/supabase'
import type {
  ActionResult,
  DealStage,
  TaskStatus,
  TOpportunityInput,
  TOpportunityTaskInput,
} from '@creator-hub/types'

type OpportunityInsert = Database['public']['Tables']['opportunities']['Insert']
type OpportunityUpdate = Database['public']['Tables']['opportunities']['Update']

// ─── Opportunities ────────────────────────────────────────────────────────────

export async function createOpportunity(
  input: TOpportunityInput,
): Promise<ActionResult<{ id: string }>> {
  const name = input.name.trim()
  if (!name) return { data: null, error: 'Name is required' }

  const supabase = await createServerSupabaseClient()
  const now = new Date().toISOString()
  const stage: DealStage = input.stage ?? 'target_identified'

  const payload: OpportunityInsert = {
    name,
    brand_id:          input.brandId ?? null,
    contact_id:        input.contactId ?? null,
    collab_type:       input.collabType?.trim() || null,
    estimated_value:   input.estimatedValue ?? null,
    currency:          input.currency?.trim() || 'EUR',
    stage,
    probability:       input.probability ?? 0,
    expected_close_at: input.expectedCloseAt || null,
    last_activity_at:  now,
    next_action:       input.nextAction?.trim() || null,
    deck_id:           input.deckId ?? null,
  }

  const { data, error } = await supabase
    .from('opportunities')
    .insert(payload)
    .select('id')
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Insert failed' }

  const { error: histError } = await supabase
    .from('opportunity_stage_history')
    .insert({ opportunity_id: data.id, stage, changed_at: now })

  if (histError) return { data: null, error: histError.message }

  revalidatePath('/deals')
  return { data: { id: data.id }, error: null }
}

export async function updateOpportunity(
  id: string,
  patch: Partial<TOpportunityInput>,
): Promise<ActionResult<null>> {
  if (!id) return { data: null, error: 'Missing id' }

  const supabase = await createServerSupabaseClient()
  const update: OpportunityUpdate = {}

  if (patch.name            !== undefined) update.name              = patch.name.trim()
  if (patch.brandId         !== undefined) update.brand_id          = patch.brandId || null
  if (patch.contactId       !== undefined) update.contact_id        = patch.contactId || null
  if (patch.collabType      !== undefined) update.collab_type       = patch.collabType?.trim() || null
  if (patch.estimatedValue  !== undefined) update.estimated_value   = patch.estimatedValue ?? null
  if (patch.currency        !== undefined) update.currency          = patch.currency?.trim() || 'EUR'
  if (patch.probability     !== undefined) update.probability       = patch.probability
  if (patch.expectedCloseAt !== undefined) update.expected_close_at = patch.expectedCloseAt || null
  if (patch.nextAction      !== undefined) update.next_action       = patch.nextAction?.trim() || null
  if (patch.deckId          !== undefined) update.deck_id           = patch.deckId || null

  if (Object.keys(update).length === 0) return { data: null, error: null }

  update.last_activity_at = new Date().toISOString()

  const { error } = await supabase.from('opportunities').update(update).eq('id', id)
  if (error) return { data: null, error: error.message }

  revalidatePath('/deals')
  revalidatePath(`/deals/${id}`)
  return { data: null, error: null }
}

export async function setOpportunityStage(
  id: string,
  stage: DealStage,
): Promise<ActionResult<null>> {
  if (!id) return { data: null, error: 'Missing id' }

  const supabase = await createServerSupabaseClient()
  const now = new Date().toISOString()

  const { error: updError } = await supabase
    .from('opportunities')
    .update({ stage, last_activity_at: now })
    .eq('id', id)
  if (updError) return { data: null, error: updError.message }

  const { error: histError } = await supabase
    .from('opportunity_stage_history')
    .insert({ opportunity_id: id, stage, changed_at: now })
  if (histError) return { data: null, error: histError.message }

  revalidatePath('/deals')
  revalidatePath(`/deals/${id}`)
  return { data: null, error: null }
}

export async function deleteOpportunity(id: string): Promise<void> {
  const supabase = await createServerSupabaseClient()
  await supabase.from('opportunities').delete().eq('id', id)
  revalidatePath('/deals')
  redirect('/deals')
}

// ─── Opportunity-scoped tasks ─────────────────────────────────────────────────

export async function createOpportunityTask(
  input: TOpportunityTaskInput,
): Promise<ActionResult<{ id: string }>> {
  const label = input.label.trim()
  if (!label) return { data: null, error: 'Label is required' }
  if (!input.linkedOpportunityId) {
    return { data: null, error: 'Task must be linked to an opportunity' }
  }

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      label,
      status:                'todo',
      due_at:                input.dueAt || null,
      linked_opportunity_id: input.linkedOpportunityId,
      linked_brand_id:       input.linkedBrandId ?? null,
      linked_contact_id:     input.linkedContactId ?? null,
    })
    .select('id')
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Insert failed' }

  revalidatePath(`/deals/${input.linkedOpportunityId}`)
  revalidatePath('/deals')
  return { data: { id: data.id }, error: null }
}

export async function setDealTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<ActionResult<null>> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', id)
    .select('linked_opportunity_id')
    .single()

  if (error) return { data: null, error: error.message }

  if (data?.linked_opportunity_id) {
    revalidatePath(`/deals/${data.linked_opportunity_id}`)
  }
  revalidatePath('/deals')
  return { data: null, error: null }
}

export async function deleteDealTask(id: string): Promise<ActionResult<null>> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .select('linked_opportunity_id')
    .single()

  if (error) return { data: null, error: error.message }

  if (data?.linked_opportunity_id) {
    revalidatePath(`/deals/${data.linked_opportunity_id}`)
  }
  revalidatePath('/deals')
  return { data: null, error: null }
}
