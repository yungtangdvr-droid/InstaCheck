'use server'

import { revalidatePath } from 'next/cache'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { asRadarClient } from '@/lib/radar/persist'
import type { ActionResult } from '@creator-hub/types'

type RadarUserDecision = 'saved' | 'ignored' | 'new'

const ALLOWED: readonly RadarUserDecision[] = ['saved', 'ignored', 'new'] as const

export async function setDecision(
  itemId:   string,
  decision: RadarUserDecision,
): Promise<ActionResult<null>> {
  if (!itemId) return { data: null, error: 'missing_item_id' }
  if (!(ALLOWED as readonly string[]).includes(decision)) {
    return { data: null, error: 'invalid_decision' }
  }

  const supabase = await createServerSupabaseClient()
  const client   = asRadarClient(supabase)

  const { error } = await client
    .from('radar_items')
    .update({ decision, decision_at: new Date().toISOString() })
    .eq('id', itemId)

  if (error) return { data: null, error: error.message }

  revalidatePath('/content-lab/radar')
  return { data: null, error: null }
}
