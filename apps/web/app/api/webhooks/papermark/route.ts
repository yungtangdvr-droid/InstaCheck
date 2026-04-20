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

  await supabase.from('asset_events').insert({
    asset_id:           asset.id,
    event_type:         eventType,
    viewer_fingerprint: payload.viewerId,
    duration_ms:        payload.duration ?? null,
    occurred_at:        payload.timestamp,
  })

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

  if (payload.event === 'link.viewed') {
    const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()

    const { data: opportunity } = await supabase
      .from('opportunities')
      .select('id, name')
      .eq('deck_id', asset.id)
      .maybeSingle()

    await supabase.from('tasks').insert({
      label:                 'Relancer suite à ouverture du deck',
      status:                'todo',
      due_at:                dueAt,
      linked_opportunity_id: opportunity?.id ?? null,
    })
  }

  return Response.json({ ok: true })
}
