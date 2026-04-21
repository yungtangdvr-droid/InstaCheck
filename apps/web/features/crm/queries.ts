import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type {
  Brand,
  BrandListRow,
  BrandStatus,
  CompanyType,
  Contact,
  ContactListRow,
  Task,
  Touchpoint,
  TouchpointType,
} from '@creator-hub/types'

type Supabase = SupabaseClient<Database>

function mapBrand(row: Database['public']['Tables']['brands']['Row']): Brand {
  return {
    id:                row.id,
    name:              row.name,
    website:           row.website ?? undefined,
    country:           row.country ?? undefined,
    category:          row.category ?? undefined,
    premiumLevel:      typeof row.premium_level === 'number' ? row.premium_level : 0,
    aestheticFitScore: row.aesthetic_fit_score ?? 0,
    businessFitScore:  row.business_fit_score ?? 0,
    status:            row.status as BrandStatus,
    notes:             row.notes ?? undefined,
    createdAt:         row.created_at,
  }
}

function mapContact(row: Database['public']['Tables']['contacts']['Row']): Contact {
  return {
    id:              row.id,
    fullName:        row.full_name,
    email:           row.email ?? undefined,
    title:           row.title ?? undefined,
    companyId:       row.company_id ?? undefined,
    companyType:     (row.company_type as CompanyType | null) ?? undefined,
    linkedinUrl:     row.linkedin_url ?? undefined,
    instagramHandle: row.instagram_handle ?? undefined,
    warmness:        row.warmness,
    lastContactAt:   row.last_contact_at ?? undefined,
    nextFollowUpAt:  row.next_follow_up_at ?? undefined,
    notes:           row.notes ?? undefined,
  }
}

function mapTouchpoint(row: Database['public']['Tables']['touchpoints']['Row']): Touchpoint {
  return {
    id:         row.id,
    contactId:  row.contact_id,
    brandId:    row.brand_id,
    type:       row.type as TouchpointType,
    note:       row.note,
    occurredAt: row.occurred_at,
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

export async function listBrands(
  supabase: Supabase,
  status?: BrandStatus,
): Promise<BrandListRow[]> {
  let q = supabase
    .from('brands')
    .select('*')
    .order('created_at', { ascending: false })

  if (status) q = q.eq('status', status)

  const { data: brands } = await q
  if (!brands || brands.length === 0) return []

  const brandIds = brands.map((b) => b.id)

  const [{ data: links }, { data: tasks }, { data: touchpoints }] = await Promise.all([
    supabase.from('brand_contacts').select('brand_id').in('brand_id', brandIds),
    supabase
      .from('tasks')
      .select('linked_brand_id, status')
      .in('linked_brand_id', brandIds)
      .eq('status', 'todo'),
    supabase
      .from('touchpoints')
      .select('brand_id, occurred_at')
      .in('brand_id', brandIds),
  ])

  const contactsCount = new Map<string, number>()
  for (const l of links ?? []) {
    contactsCount.set(l.brand_id, (contactsCount.get(l.brand_id) ?? 0) + 1)
  }

  const openTasksCount = new Map<string, number>()
  for (const t of tasks ?? []) {
    if (!t.linked_brand_id) continue
    openTasksCount.set(t.linked_brand_id, (openTasksCount.get(t.linked_brand_id) ?? 0) + 1)
  }

  const lastTp = new Map<string, string>()
  for (const tp of touchpoints ?? []) {
    if (!tp.brand_id) continue
    const prev = lastTp.get(tp.brand_id)
    if (!prev || tp.occurred_at > prev) lastTp.set(tp.brand_id, tp.occurred_at)
  }

  return brands.map((row) => ({
    ...mapBrand(row),
    contactsCount:    contactsCount.get(row.id) ?? 0,
    openTasksCount:   openTasksCount.get(row.id) ?? 0,
    lastTouchpointAt: lastTp.get(row.id) ?? null,
  }))
}

export async function getBrand(supabase: Supabase, id: string): Promise<Brand | null> {
  const { data } = await supabase.from('brands').select('*').eq('id', id).maybeSingle()
  return data ? mapBrand(data) : null
}

export async function getBrandContacts(supabase: Supabase, brandId: string): Promise<Contact[]> {
  const { data: links } = await supabase
    .from('brand_contacts')
    .select('contact_id')
    .eq('brand_id', brandId)
  const ids = (links ?? []).map((l) => l.contact_id)
  if (ids.length === 0) return []

  const { data } = await supabase.from('contacts').select('*').in('id', ids)
  return (data ?? []).map(mapContact)
}

export async function listContacts(
  supabase: Supabase,
  companyType?: CompanyType,
): Promise<ContactListRow[]> {
  let q = supabase.from('contacts').select('*').order('full_name', { ascending: true })
  if (companyType) q = q.eq('company_type', companyType)

  const { data: contacts } = await q
  if (!contacts || contacts.length === 0) return []

  const brandIds = contacts
    .filter((c) => c.company_type === 'brand' && c.company_id)
    .map((c) => c.company_id as string)

  const brandNames = new Map<string, string>()
  if (brandIds.length > 0) {
    const { data: brands } = await supabase
      .from('brands')
      .select('id, name')
      .in('id', brandIds)
    for (const b of brands ?? []) brandNames.set(b.id, b.name)
  }

  return contacts.map((row) => ({
    ...mapContact(row),
    brandName:
      row.company_type === 'brand' && row.company_id
        ? brandNames.get(row.company_id) ?? null
        : null,
  }))
}

export async function getContact(supabase: Supabase, id: string): Promise<Contact | null> {
  const { data } = await supabase.from('contacts').select('*').eq('id', id).maybeSingle()
  return data ? mapContact(data) : null
}

export async function getTouchpointsForBrand(
  supabase: Supabase,
  brandId: string,
): Promise<Touchpoint[]> {
  const { data } = await supabase
    .from('touchpoints')
    .select('*')
    .eq('brand_id', brandId)
    .order('occurred_at', { ascending: false })
    .limit(100)
  return (data ?? []).map(mapTouchpoint)
}

export async function getTouchpointsForContact(
  supabase: Supabase,
  contactId: string,
): Promise<Touchpoint[]> {
  const { data } = await supabase
    .from('touchpoints')
    .select('*')
    .eq('contact_id', contactId)
    .order('occurred_at', { ascending: false })
    .limit(100)
  return (data ?? []).map(mapTouchpoint)
}

export async function getOpenTasksForBrand(
  supabase: Supabase,
  brandId: string,
): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('linked_brand_id', brandId)
    .neq('status', 'done')
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
  return (data ?? []).map(mapTask)
}

export async function getOpenTasksForContact(
  supabase: Supabase,
  contactId: string,
): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('linked_contact_id', contactId)
    .neq('status', 'done')
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
  return (data ?? []).map(mapTask)
}

export async function listUnlinkedContactsForBrand(
  supabase: Supabase,
  brandId: string,
): Promise<Contact[]> {
  const { data: links } = await supabase
    .from('brand_contacts')
    .select('contact_id')
    .eq('brand_id', brandId)
  const linkedIds = new Set((links ?? []).map((l) => l.contact_id))

  const { data } = await supabase.from('contacts').select('*').order('full_name')
  return (data ?? []).filter((c) => !linkedIds.has(c.id)).map(mapContact)
}

export async function getParentBrand(
  supabase: Supabase,
  contact: Contact,
): Promise<Brand | null> {
  if (contact.companyType !== 'brand' || !contact.companyId) return null
  return getBrand(supabase, contact.companyId)
}
