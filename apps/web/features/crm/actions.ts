'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@creator-hub/types/supabase'
import type {
  ActionResult,
  TaskStatus,
  TBrandInput,
  TContactInput,
  TTaskInput,
  TTouchpointInput,
} from '@creator-hub/types'

type BrandInsert   = Database['public']['Tables']['brands']['Insert']
type BrandUpdate   = Database['public']['Tables']['brands']['Update']
type ContactInsert = Database['public']['Tables']['contacts']['Insert']
type ContactUpdate = Database['public']['Tables']['contacts']['Update']

// ─── Brands ───────────────────────────────────────────────────────────────────

export async function createBrand(
  input: TBrandInput,
): Promise<ActionResult<{ id: string }>> {
  const name = input.name.trim()
  if (!name) return { data: null, error: 'Name is required' }

  const supabase = await createServerSupabaseClient()
  const payload: BrandInsert = {
    name,
    website:  input.website?.trim() || null,
    country:  input.country?.trim() || null,
    category: input.category?.trim() || null,
    status:   input.status ?? 'cold',
    notes:    input.notes?.trim() || null,
  }
  if (input.aestheticFitScore !== undefined) payload.aesthetic_fit_score = input.aestheticFitScore
  if (input.businessFitScore  !== undefined) payload.business_fit_score  = input.businessFitScore

  const { data, error } = await supabase
    .from('brands')
    .insert(payload)
    .select('id')
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Insert failed' }

  revalidatePath('/crm')
  return { data: { id: data.id }, error: null }
}

export async function updateBrand(
  id: string,
  patch: Partial<TBrandInput>,
): Promise<ActionResult<null>> {
  if (!id) return { data: null, error: 'Missing id' }

  const supabase = await createServerSupabaseClient()
  const update: BrandUpdate = {}
  if (patch.name              !== undefined) update.name                = patch.name.trim()
  if (patch.website           !== undefined) update.website             = patch.website?.trim() || null
  if (patch.country           !== undefined) update.country             = patch.country?.trim() || null
  if (patch.category          !== undefined) update.category            = patch.category?.trim() || null
  if (patch.aestheticFitScore !== undefined) update.aesthetic_fit_score = patch.aestheticFitScore
  if (patch.businessFitScore  !== undefined) update.business_fit_score  = patch.businessFitScore
  if (patch.status            !== undefined) update.status              = patch.status
  if (patch.notes             !== undefined) update.notes               = patch.notes?.trim() || null

  if (Object.keys(update).length === 0) return { data: null, error: null }

  const { error } = await supabase.from('brands').update(update).eq('id', id)
  if (error) return { data: null, error: error.message }

  revalidatePath('/crm')
  revalidatePath(`/crm/brands/${id}`)
  return { data: null, error: null }
}

export async function deleteBrand(id: string): Promise<void> {
  const supabase = await createServerSupabaseClient()
  await supabase.from('brands').delete().eq('id', id)
  revalidatePath('/crm')
  redirect('/crm')
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export async function createContact(
  input: TContactInput,
  linkToBrandId?: string,
): Promise<ActionResult<{ id: string }>> {
  const fullName = input.fullName.trim()
  if (!fullName) return { data: null, error: 'Full name is required' }

  const supabase = await createServerSupabaseClient()
  const payload: ContactInsert = {
    full_name:         fullName,
    email:             input.email?.trim() || null,
    title:             input.title?.trim() || null,
    company_id:        input.companyId ?? linkToBrandId ?? null,
    company_type:      input.companyType ?? (linkToBrandId ? 'brand' : null),
    linkedin_url:      input.linkedinUrl?.trim() || null,
    instagram_handle:  input.instagramHandle?.trim() || null,
    warmness:          input.warmness ?? 0,
    next_follow_up_at: input.nextFollowUpAt || null,
    notes:             input.notes?.trim() || null,
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert(payload)
    .select('id')
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Insert failed' }

  if (linkToBrandId) {
    const { error: linkError } = await supabase
      .from('brand_contacts')
      .insert({ brand_id: linkToBrandId, contact_id: data.id })
    if (linkError && linkError.code !== '23505') {
      return { data: null, error: linkError.message }
    }
    revalidatePath(`/crm/brands/${linkToBrandId}`)
  }

  revalidatePath('/crm/contacts')
  return { data: { id: data.id }, error: null }
}

export async function updateContact(
  id: string,
  patch: Partial<TContactInput>,
): Promise<ActionResult<null>> {
  if (!id) return { data: null, error: 'Missing id' }

  const supabase = await createServerSupabaseClient()
  const update: ContactUpdate = {}
  if (patch.fullName        !== undefined) update.full_name         = patch.fullName.trim()
  if (patch.email           !== undefined) update.email             = patch.email?.trim() || null
  if (patch.title           !== undefined) update.title             = patch.title?.trim() || null
  if (patch.companyId       !== undefined) update.company_id        = patch.companyId || null
  if (patch.companyType     !== undefined) update.company_type      = patch.companyType ?? null
  if (patch.linkedinUrl     !== undefined) update.linkedin_url      = patch.linkedinUrl?.trim() || null
  if (patch.instagramHandle !== undefined) update.instagram_handle  = patch.instagramHandle?.trim() || null
  if (patch.warmness        !== undefined) update.warmness          = patch.warmness
  if (patch.nextFollowUpAt  !== undefined) update.next_follow_up_at = patch.nextFollowUpAt || null
  if (patch.notes           !== undefined) update.notes             = patch.notes?.trim() || null

  if (Object.keys(update).length === 0) return { data: null, error: null }

  const { error } = await supabase.from('contacts').update(update).eq('id', id)
  if (error) return { data: null, error: error.message }

  revalidatePath('/crm/contacts')
  revalidatePath(`/crm/contacts/${id}`)
  revalidatePath('/crm')
  return { data: null, error: null }
}

export async function deleteContact(id: string): Promise<void> {
  const supabase = await createServerSupabaseClient()
  await supabase.from('contacts').delete().eq('id', id)
  revalidatePath('/crm/contacts')
  revalidatePath('/crm')
  redirect('/crm/contacts')
}

// ─── Brand ↔ Contact links ────────────────────────────────────────────────────

export async function linkContactToBrand(
  brandId: string,
  contactId: string,
): Promise<ActionResult<null>> {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('brand_contacts')
    .insert({ brand_id: brandId, contact_id: contactId })
  if (error && error.code !== '23505') return { data: null, error: error.message }

  revalidatePath(`/crm/brands/${brandId}`)
  revalidatePath('/crm')
  return { data: null, error: null }
}

export async function unlinkContactFromBrand(
  brandId: string,
  contactId: string,
): Promise<ActionResult<null>> {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('brand_contacts')
    .delete()
    .eq('brand_id', brandId)
    .eq('contact_id', contactId)
  if (error) return { data: null, error: error.message }

  revalidatePath(`/crm/brands/${brandId}`)
  revalidatePath('/crm')
  return { data: null, error: null }
}

// ─── Touchpoints ──────────────────────────────────────────────────────────────

export async function createTouchpoint(
  input: TTouchpointInput,
): Promise<ActionResult<{ id: string }>> {
  // touchpoints.contact_id is `uuid not null` in the schema (brand_id is
  // nullable). Reject brand-only calls at the action level rather than
  // letting the DB raise a NOT NULL violation.
  if (!input.contactId) {
    return { data: null, error: 'Touchpoint needs a contact' }
  }

  const supabase = await createServerSupabaseClient()
  const occurredAt = input.occurredAt ?? new Date().toISOString()

  const { data, error } = await supabase
    .from('touchpoints')
    .insert({
      contact_id:  input.contactId,
      brand_id:    input.brandId ?? null,
      type:        input.type,
      note:        input.note?.trim() || null,
      occurred_at: occurredAt,
    })
    .select('id')
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Insert failed' }

  if (input.contactId) {
    await supabase
      .from('contacts')
      .update({ last_contact_at: occurredAt })
      .eq('id', input.contactId)
    revalidatePath(`/crm/contacts/${input.contactId}`)
  }
  if (input.brandId) revalidatePath(`/crm/brands/${input.brandId}`)

  return { data: { id: data.id }, error: null }
}

// ─── Tasks (scoped to CRM) ────────────────────────────────────────────────────

export async function createTask(
  input: TTaskInput,
): Promise<ActionResult<{ id: string }>> {
  const label = input.label.trim()
  if (!label) return { data: null, error: 'Label is required' }
  if (!input.linkedBrandId && !input.linkedContactId) {
    return { data: null, error: 'Task must be linked to a brand or a contact' }
  }

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      label,
      status:             'todo',
      due_at:             input.dueAt || null,
      linked_brand_id:    input.linkedBrandId ?? null,
      linked_contact_id:  input.linkedContactId ?? null,
    })
    .select('id')
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Insert failed' }

  if (input.linkedBrandId) revalidatePath(`/crm/brands/${input.linkedBrandId}`)
  if (input.linkedContactId) revalidatePath(`/crm/contacts/${input.linkedContactId}`)
  revalidatePath('/crm')

  return { data: { id: data.id }, error: null }
}

export async function setTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<ActionResult<null>> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', id)
    .select('linked_brand_id, linked_contact_id')
    .single()

  if (error) return { data: null, error: error.message }

  if (data?.linked_brand_id) revalidatePath(`/crm/brands/${data.linked_brand_id}`)
  if (data?.linked_contact_id) revalidatePath(`/crm/contacts/${data.linked_contact_id}`)
  revalidatePath('/crm')
  return { data: null, error: null }
}

export async function deleteTask(id: string): Promise<ActionResult<null>> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .select('linked_brand_id, linked_contact_id')
    .single()

  if (error) return { data: null, error: error.message }

  if (data?.linked_brand_id) revalidatePath(`/crm/brands/${data.linked_brand_id}`)
  if (data?.linked_contact_id) revalidatePath(`/crm/contacts/${data.linked_contact_id}`)
  revalidatePath('/crm')
  return { data: null, error: null }
}
