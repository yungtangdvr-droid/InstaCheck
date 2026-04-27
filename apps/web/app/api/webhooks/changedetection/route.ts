import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { ChangedetectionWebhookPayload } from '@creator-hub/types'
import { normalizeUrl } from '@/features/brand-watch/utils'

export const runtime = 'nodejs'

/**
 * Inbound webhook from changedetection.io.
 *
 * Body shape is user-configurable in changedetection, so we accept a loose
 * payload and only require `url`. The endpoint:
 *   1. inserts a raw_watchlist_events row (always)
 *   2. bumps brand_watchlists.last_change_at on the single matching active
 *      watchlist — if exactly one active watchlist matches the normalized URL.
 *
 * Multi-match is NOT auto-resolved. Ambiguous URLs surface in the /brand-watch
 * review queue, where the user must disable or delete conflicting watchlists
 * before a task can be created.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const secret     = process.env.CHANGEDETECTION_WEBHOOK_SECRET

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: ChangedetectionWebhookPayload
  try {
    payload = (await request.json()) as ChangedetectionWebhookPayload
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const url = typeof payload?.url === 'string' ? payload.url.trim() : ''
  if (!url) {
    return Response.json({ error: 'Missing url' }, { status: 400 })
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // raw_watchlist_events.change_summary is `text not null` in the schema,
  // so always fall back to '' (empty string) rather than null when the
  // payload carries no usable summary.
  const changeSummary =
    payload.change_summary?.trim() ||
    payload.diff?.trim() ||
    payload.current_snapshot?.trim() ||
    ''

  const detectedAt = payload.detected_at ?? new Date().toISOString()

  const { error: insertError } = await supabase
    .from('raw_watchlist_events')
    .insert({
      url,
      change_summary: changeSummary,
      detected_at:    detectedAt,
    })

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 })
  }

  // Bump last_change_at only when exactly one active watchlist matches.
  const normalized = normalizeUrl(url)
  let matchedWatchlistId: string | null = null
  let ambiguous = false

  if (normalized) {
    const { data: actives } = await supabase
      .from('brand_watchlists')
      .select('id, url')
      .eq('active', true)

    const candidates = (actives ?? []).filter((w) => normalizeUrl(w.url) === normalized)
    if (candidates.length === 1) {
      matchedWatchlistId = candidates[0].id
      await supabase
        .from('brand_watchlists')
        .update({ last_change_at: detectedAt })
        .eq('id', matchedWatchlistId)
    } else if (candidates.length > 1) {
      ambiguous = true
    }
  }

  return Response.json({ ok: true, matchedWatchlistId, ambiguous })
}
