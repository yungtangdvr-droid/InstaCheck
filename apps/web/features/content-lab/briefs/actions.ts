'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { updateBriefStatus } from '@/lib/briefs/persist'
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_MODEL,
  runBriefBatch,
} from '@/lib/briefs/generate-batch'
import type { ActionResult, MemeBriefStatus } from '@creator-hub/types'

const ALLOWED: readonly MemeBriefStatus[] = ['draft', 'kept', 'discarded', 'shipped'] as const

export async function setBriefStatus(
  briefId: string,
  status:  MemeBriefStatus,
): Promise<ActionResult<null>> {
  if (!briefId) return { data: null, error: 'missing_brief_id' }
  if (!(ALLOWED as readonly string[]).includes(status)) {
    return { data: null, error: 'invalid_status' }
  }

  const supabase = await createServerSupabaseClient()
  try {
    await updateBriefStatus(supabase, briefId, status)
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'update_failed' }
  }

  revalidatePath('/content-lab/briefs')
  revalidatePath(`/content-lab/briefs/${briefId}`)
  revalidatePath('/content-lab/radar')
  return { data: null, error: null }
}

// Server-action wrapper around runBriefBatch for the radar card
// "Generate brief" button. Uses the operator's authenticated session
// (no Bearer auth needed). Falls back to service-role for the actual
// brief generation so RLS doesn't bite mid-batch.
export async function generateBriefForRadarItem(
  radarItemId: string,
): Promise<ActionResult<{ briefId: string | null }>> {
  if (!radarItemId) return { data: null, error: 'missing_radar_item_id' }

  const authClient = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) return { data: null, error: 'unauthorized' }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const geminiKey   = process.env.GEMINI_API_KEY
  const geminiModel = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL
  const openaiFallbackEnabled =
    process.env.CONTENT_ANALYSIS_OPENAI_FALLBACK_ENABLED === 'true'
  const openaiKeyRaw = process.env.OPENAI_API_KEY
  const openaiModel  = process.env.OPENAI_CONTENT_ANALYSIS_MODEL ?? DEFAULT_OPENAI_MODEL

  const missing: string[] = []
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!geminiKey)   missing.push('GEMINI_API_KEY')
  if (openaiFallbackEnabled && !openaiKeyRaw) missing.push('OPENAI_API_KEY')
  if (missing.length > 0) return { data: null, error: `missing_env:${missing.join(',')}` }

  const supabase = createClient<Database>(supabaseUrl!, supabaseKey!)

  try {
    const result = await runBriefBatch({
      supabase,
      limit:          1,
      explicitItemId: radarItemId,
      ctx: {
        geminiKey:             geminiKey!,
        geminiModel,
        openaiKey:             openaiFallbackEnabled ? (openaiKeyRaw ?? null) : null,
        openaiModel,
        openaiFallbackEnabled,
      },
    })
    revalidatePath('/content-lab/radar')
    revalidatePath('/content-lab/briefs')
    const first = result.outcomes[0]
    if (!first) {
      return { data: null, error: result.noOpReason ?? 'no_outcome' }
    }
    if (first.status === 'failed') {
      return { data: null, error: first.error ?? 'generation_failed' }
    }
    return { data: { briefId: first.briefId }, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'generation_failed' }
  }
}
