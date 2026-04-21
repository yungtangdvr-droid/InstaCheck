'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@creator-hub/types/supabase'
import type {
  ActionResult,
  TEventToTaskResult,
  TWatchlistInput,
} from '@creator-hub/types'
import { normalizeUrl, urlHost, watchTaskLabel } from './utils'

type WatchInsert = Database['public']['Tables']['brand_watchlists']['Insert']
type WatchUpdate = Database['public']['Tables']['brand_watchlists']['Update']

const DEDUP_WINDOW_HOURS = 24

function validateInput(input: TWatchlistInput): string | null {
  if (!input.brandId?.trim())            return 'Brand requise'
  if (!input.url?.trim())                return 'URL requise'
  if (!normalizeUrl(input.url))          return 'URL invalide'
  return null
}

export async function createWatchlist(
  input: TWatchlistInput,
): Promise<ActionResult<{ id: string }>> {
  const err = validateInput(input)
  if (err) return { data: null, error: err }

  const supabase = await createServerSupabaseClient()
  const payload: WatchInsert = {
    brand_id: input.brandId,
    url:      input.url.trim(),
    label:    input.label?.trim() || null,
    active:   input.active ?? true,
  }

  const { data, error } = await supabase
    .from('brand_watchlists')
    .insert(payload)
    .select('id')
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Insert failed' }

  revalidatePath('/brand-watch')
  revalidatePath(`/crm/brands/${input.brandId}`)
  return { data: { id: data.id }, error: null }
}

export async function updateWatchlist(
  id: string,
  patch: Partial<TWatchlistInput>,
): Promise<ActionResult<null>> {
  if (!id) return { data: null, error: 'Missing id' }

  const supabase = await createServerSupabaseClient()
  const update: WatchUpdate = {}

  if (patch.url !== undefined) {
    const v = patch.url.trim()
    if (!v)                  return { data: null, error: 'URL requise' }
    if (!normalizeUrl(v))    return { data: null, error: 'URL invalide' }
    update.url = v
  }
  if (patch.label   !== undefined) update.label   = patch.label?.trim() || null
  if (patch.active  !== undefined) update.active  = patch.active
  if (patch.brandId !== undefined) {
    if (!patch.brandId.trim()) return { data: null, error: 'Brand requise' }
    update.brand_id = patch.brandId
  }

  if (Object.keys(update).length === 0) return { data: null, error: null }

  const { data: before } = await supabase
    .from('brand_watchlists')
    .select('brand_id')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase.from('brand_watchlists').update(update).eq('id', id)
  if (error) return { data: null, error: error.message }

  revalidatePath('/brand-watch')
  if (before?.brand_id) revalidatePath(`/crm/brands/${before.brand_id}`)
  if (update.brand_id && update.brand_id !== before?.brand_id) {
    revalidatePath(`/crm/brands/${update.brand_id}`)
  }
  return { data: null, error: null }
}

export async function toggleWatchlist(
  id: string,
  active: boolean,
): Promise<ActionResult<null>> {
  return updateWatchlist(id, { active })
}

export async function deleteWatchlist(id: string): Promise<ActionResult<null>> {
  if (!id) return { data: null, error: 'Missing id' }

  const supabase = await createServerSupabaseClient()
  const { data: before } = await supabase
    .from('brand_watchlists')
    .select('brand_id')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase.from('brand_watchlists').delete().eq('id', id)
  if (error) return { data: null, error: error.message }

  revalidatePath('/brand-watch')
  if (before?.brand_id) revalidatePath(`/crm/brands/${before.brand_id}`)
  return { data: null, error: null }
}

/**
 * Create a "Relance veille" task from a review-queue event.
 *
 * Idempotency: before inserting, check for a task on the same brand with the
 * exact same label, status != 'done', created within the last
 * DEDUP_WINDOW_HOURS. If found, return it and flag deduped=true.
 *
 * The caller MUST only invoke this for matched events (single watchlist).
 * Ambiguous events are rejected with an explicit error so the UI cannot
 * accidentally guess a brand.
 */
export async function createTaskFromEvent(args: {
  brandId:     string
  watchlistId: string
  eventUrl:    string
  label?:      string | null
}): Promise<ActionResult<TEventToTaskResult>> {
  if (!args.brandId)     return { data: null, error: 'Brand requise' }
  if (!args.watchlistId) return { data: null, error: 'Watchlist requise' }

  const supabase = await createServerSupabaseClient()

  const { data: watch } = await supabase
    .from('brand_watchlists')
    .select('id, brand_id, url, label, active')
    .eq('id', args.watchlistId)
    .maybeSingle()

  if (!watch || !watch.active) {
    return { data: null, error: 'Watchlist introuvable ou inactive' }
  }
  if (watch.brand_id !== args.brandId) {
    return { data: null, error: 'Brand / watchlist incohérents' }
  }

  const { data: brand } = await supabase
    .from('brands')
    .select('name')
    .eq('id', args.brandId)
    .maybeSingle()
  if (!brand) return { data: null, error: 'Brand introuvable' }

  const labelText = (args.label ?? watch.label ?? '').trim() || urlHost(watch.url) || watch.url
  const taskLabel = watchTaskLabel(brand.name, labelText)

  const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3_600_000).toISOString()
  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('linked_brand_id', args.brandId)
    .eq('label', taskLabel)
    .neq('status', 'done')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)

  if (existing && existing.length > 0) {
    return { data: { taskId: existing[0].id, deduped: true }, error: null }
  }

  const dueAt = new Date(Date.now() + 2 * 86_400_000).toISOString()
  const { data: inserted, error } = await supabase
    .from('tasks')
    .insert({
      label:           taskLabel,
      status:          'todo',
      due_at:          dueAt,
      linked_brand_id: args.brandId,
    })
    .select('id')
    .single()

  if (error || !inserted) return { data: null, error: error?.message ?? 'Insert failed' }

  revalidatePath('/brand-watch')
  revalidatePath(`/crm/brands/${args.brandId}`)
  return { data: { taskId: inserted.id, deduped: false }, error: null }
}
