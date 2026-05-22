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
): Promise<ActionResult<{ briefId: string | null; status?: string }>> {
  if (!radarItemId) return { data: null, error: 'missing_radar_item_id' }

  const authClient = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) return { data: null, error: 'unauthorized' }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const geminiKey   = process.env.GEMINI_API_KEY
  const geminiModel = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL
  const openaiKeyRaw = process.env.OPENAI_API_KEY
  const openaiModel  = process.env.OPENAI_CONTENT_ANALYSIS_MODEL ?? DEFAULT_OPENAI_MODEL

  // Hotfix v1.1: enable OpenAI fallback automatically whenever an
  // OPENAI_API_KEY is present. The legacy
  // `CONTENT_ANALYSIS_OPENAI_FALLBACK_ENABLED=true` env still works
  // (and we honor it when explicitly set), but we no longer require it
  // for the UI path — operator feedback was that Gemini "high demand"
  // errors were leaking to the UI even when an OpenAI key existed.
  const explicitToggle = process.env.CONTENT_ANALYSIS_OPENAI_FALLBACK_ENABLED
  const openaiFallbackEnabled =
    explicitToggle === 'false'
      ? false
      : (explicitToggle === 'true' || (typeof openaiKeyRaw === 'string' && openaiKeyRaw.length > 0))

  const missing: string[] = []
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!geminiKey)   missing.push('GEMINI_API_KEY')
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
      return { data: null, error: result.noOpReason ?? 'missing_radar_item' }
    }
    if (first.status === 'failed') {
      // Stitch provider attempts but never leak raw secrets. The
      // analyze-* helpers truncate their error payloads already; we
      // truncate again defensively here.
      const detail = (first.error ?? 'provider_error').slice(0, 240)
      return { data: null, error: `provider_error:${detail}` }
    }
    return {
      data:  { briefId: first.briefId, status: first.status },
      error: null,
    }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'generation_failed' }
  }
}
