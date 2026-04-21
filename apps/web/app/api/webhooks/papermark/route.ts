import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'
import type { Database } from '@creator-hub/types/supabase'
import type { PapermarkWebhookPayload } from '@creator-hub/types'

export const runtime = 'nodejs'

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.PAPERMARK_WEBHOOK_SECRET
  if (!secret) return Response.json({ error: 'Webhook secret not configured' }, { status: 500 })

  const rawBody   = await request.text()
  const signature = request.headers.get('x-papermark-signature') ?? ''

  if (!verifySignature(rawBody, signature, secret)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: PapermarkWebhookPayload
  try {
    payload = JSON.parse(rawBody) as PapermarkWebhookPayload
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: asset } = await supabase
    .from('assets')
    .select('id')
    .eq('papermark_link_id', payload.linkId)
    .maybeSingle()

  if (!asset) {
    return Response.json({ ok: true, skipped: 'asset not found' })
  }

  const eventType = payload.event === 'link.viewed' ? 'opened' : 'completed'

  // Explicit dedup: identical (asset, event_type, viewer, timestamp) tuples are
  // treated as webhook retries. Papermark can replay on 5xx / network errors.
  const { data: existingEvent } = await supabase
    .from('asset_events')
    .select('id')
    .eq('asset_id', asset.id)
    .eq('event_type', eventType)
    .eq('occurred_at', payload.timestamp)
    .eq('viewer_fingerprint', payload.viewerId)
    .maybeSingle()

  if (!existingEvent) {
    await supabase.from('asset_events').insert({
      asset_id:           asset.id,
      event_type:         eventType,
      viewer_fingerprint: payload.viewerId,
      duration_ms:        payload.duration ?? null,
      occurred_at:        payload.timestamp,
    })
  }

  // Use upsert with ignoreDuplicates to avoid duplicate events
  await supabase.from('raw_papermark_events').upsert(
    {
      event_id:    `${payload.linkId}-${payload.viewerId}-${payload.timestamp}`,
      asset_id:    payload.linkId,
      event_type:  payload.event,
      viewer_id:   payload.viewerId,
      duration_ms: payload.duration ?? null,
      occurred_at: payload.timestamp,
    },
    { onConflict: 'event_id', ignoreDuplicates: true }
  )

  if (payload.event === 'link.viewed' && !existingEvent) {
    const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()

    const { data: opportunity } = await supabase
      .from('opportunities')
      .select('id, name')
      .eq('deck_id', asset.id)
      .maybeSingle()

    // Avoid piling up relance tasks when multiple opens land within a day.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    let relanceExists = false

    if (opportunity?.id) {
      const { data: recent } = await supabase
        .from('tasks')
        .select('id')
        .eq('linked_opportunity_id', opportunity.id)
        .eq('status', 'todo')
        .ilike('label', 'Relancer suite%')
        .gte('created_at', since)
        .limit(1)
      relanceExists = !!recent && recent.length > 0
    }

    if (!relanceExists) {
      await supabase.from('tasks').insert({
        label:                 'Relancer suite à ouverture du deck',
        status:                'todo',
        due_at:                dueAt,
        linked_opportunity_id: opportunity?.id ?? null,
      })
    }
  }

  return Response.json({ ok: true })
}
