'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@creator-hub/types/supabase'
import type { ActionResult, TAttributionRuleInput } from '@creator-hub/types'
import { isAttributionMatchType, isAttributionTargetType } from './utils'

type RuleInsert = Database['public']['Tables']['attribution_rules']['Insert']
type RuleUpdate = Database['public']['Tables']['attribution_rules']['Update']

function validate(input: TAttributionRuleInput): string | null {
  if (!input.label.trim())       return 'Label requis'
  if (!input.pattern.trim())     return 'Pattern requis'
  if (!input.targetId.trim())    return 'Cible requise'
  if (!isAttributionMatchType(input.matchType))   return 'Type de match invalide'
  if (!isAttributionTargetType(input.targetType)) return 'Type de cible invalide'
  return null
}

export async function createRule(
  input: TAttributionRuleInput,
): Promise<ActionResult<{ id: string }>> {
  const err = validate(input)
  if (err) return { data: null, error: err }

  const supabase = await createServerSupabaseClient()

  const payload: RuleInsert = {
    label:       input.label.trim(),
    match_type:  input.matchType,
    pattern:     input.pattern.trim(),
    target_type: input.targetType,
    target_id:   input.targetId,
    priority:    input.priority ?? 100,
    active:      input.active ?? true,
  }

  const { data, error } = await supabase
    .from('attribution_rules')
    .insert(payload)
    .select('id')
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Insert failed' }

  revalidatePath('/attribution')
  revalidatePath('/attribution/rules')
  return { data: { id: data.id }, error: null }
}

export async function updateRule(
  id: string,
  patch: Partial<TAttributionRuleInput>,
): Promise<ActionResult<null>> {
  if (!id) return { data: null, error: 'Missing id' }

  const supabase = await createServerSupabaseClient()
  const update: RuleUpdate = {}

  if (patch.label !== undefined) {
    const v = patch.label.trim()
    if (!v) return { data: null, error: 'Label requis' }
    update.label = v
  }
  if (patch.pattern !== undefined) {
    const v = patch.pattern.trim()
    if (!v) return { data: null, error: 'Pattern requis' }
    update.pattern = v
  }
  if (patch.matchType !== undefined) {
    if (!isAttributionMatchType(patch.matchType)) return { data: null, error: 'Type de match invalide' }
    update.match_type = patch.matchType
  }
  if (patch.targetType !== undefined) {
    if (!isAttributionTargetType(patch.targetType)) return { data: null, error: 'Type de cible invalide' }
    update.target_type = patch.targetType
  }
  if (patch.targetId !== undefined) {
    if (!patch.targetId.trim()) return { data: null, error: 'Cible requise' }
    update.target_id = patch.targetId
  }
  if (patch.priority !== undefined) update.priority = patch.priority
  if (patch.active   !== undefined) update.active   = patch.active

  if (Object.keys(update).length === 0) return { data: null, error: null }

  const { error } = await supabase.from('attribution_rules').update(update).eq('id', id)
  if (error) return { data: null, error: error.message }

  revalidatePath('/attribution')
  revalidatePath('/attribution/rules')
  return { data: null, error: null }
}

export async function deleteRule(id: string): Promise<ActionResult<null>> {
  if (!id) return { data: null, error: 'Missing id' }
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('attribution_rules').delete().eq('id', id)
  if (error) return { data: null, error: error.message }

  revalidatePath('/attribution')
  revalidatePath('/attribution/rules')
  return { data: null, error: null }
}

export async function toggleRule(
  id: string,
  active: boolean,
): Promise<ActionResult<null>> {
  return updateRule(id, { active })
}
