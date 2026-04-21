'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@creator-hub/types/supabase'
import type { ActionResult, TAssetInput } from '@creator-hub/types'
import { isAssetType } from './utils'

type AssetInsert = Database['public']['Tables']['assets']['Insert']
type AssetUpdate = Database['public']['Tables']['assets']['Update']

export async function createAsset(
  input: TAssetInput,
): Promise<ActionResult<{ id: string }>> {
  const name = input.name.trim()
  if (!name) return { data: null, error: 'Name is required' }
  if (!isAssetType(input.type)) return { data: null, error: 'Invalid asset type' }

  const supabase = await createServerSupabaseClient()

  const payload: AssetInsert = {
    name,
    type:               input.type,
    papermark_link_id:  input.papermarkLinkId?.trim() || null,
    papermark_link_url: input.papermarkLinkUrl?.trim() || null,
  }

  const { data, error } = await supabase
    .from('assets')
    .insert(payload)
    .select('id')
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Insert failed' }

  revalidatePath('/assets')
  return { data: { id: data.id }, error: null }
}

export async function updateAsset(
  id: string,
  patch: Partial<TAssetInput>,
): Promise<ActionResult<null>> {
  if (!id) return { data: null, error: 'Missing id' }

  const supabase = await createServerSupabaseClient()
  const update: AssetUpdate = {}

  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return { data: null, error: 'Name is required' }
    update.name = name
  }
  if (patch.type !== undefined) {
    if (!isAssetType(patch.type)) return { data: null, error: 'Invalid asset type' }
    update.type = patch.type
  }
  if (patch.papermarkLinkId !== undefined) {
    update.papermark_link_id = patch.papermarkLinkId.trim() || null
  }
  if (patch.papermarkLinkUrl !== undefined) {
    update.papermark_link_url = patch.papermarkLinkUrl.trim() || null
  }

  if (Object.keys(update).length === 0) return { data: null, error: null }

  const { error } = await supabase.from('assets').update(update).eq('id', id)
  if (error) return { data: null, error: error.message }

  revalidatePath('/assets')
  revalidatePath(`/assets/${id}`)
  return { data: null, error: null }
}

export async function deleteAsset(id: string): Promise<void> {
  const supabase = await createServerSupabaseClient()
  await supabase.from('assets').delete().eq('id', id)
  revalidatePath('/assets')
  redirect('/assets')
}
