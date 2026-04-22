import { type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import { logAutomationRun } from '@/features/automations/queries'
import { verifyCalcomSignature } from '@/lib/calcom/verify'
import {
  buildTaskLabel,
  buildTouchpointNote,
  findTaskByBookingUid,
  findTouchpointsByBookingUid,
} from '@/lib/calcom/markers'

export const runtime = 'nodejs'

const AUTOMATION_NAME = 'calcom-webhook'

type Supabase = SupabaseClient<Database>

type CalcomAttendee = { email?: string; name?: string }

type CalcomPayload = {
  triggerEvent?: string
  payload?: {
    uid?:                string
    title?:              string
    startTime?:          string
    endTime?:            string
    attendees?:          CalcomAttendee[]
    cancellationReason?: string
  }
}

async function skipped(supabase: Supabase, summary: string) {
  await logAutomationRun(supabase, AUTOMATION_NAME, 'skipped', summary)
  return Response.json({ ok: true, skipped: true, reason: summary })
}

async function succeeded(supabase: Supabase, summary: string) {
  await logAutomationRun(supabase, AUTOMATION_NAME, 'success', summary)
  return Response.json({ ok: true })
}

async function failed(supabase: Supabase, summary: string, status = 500) {
  await logAutomationRun(supabase, AUTOMATION_NAME, 'failed', summary)
  return Response.json({ ok: false, error: summary }, { status })
}

export async function POST(request: NextRequest) {
  const secret = process.env.CALCOM_WEBHOOK_SECRET
  if (!secret) {
    return Response.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const rawBody   = await request.text()
  const signature = request.headers.get('x-cal-signature-256') ?? ''

  if (!verifyCalcomSignature(rawBody, signature, secret)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: CalcomPayload
  try {
    body = JSON.parse(rawBody) as CalcomPayload
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const trigger = body.triggerEvent
  if (
    trigger !== 'BOOKING_CREATED' &&
    trigger !== 'BOOKING_RESCHEDULED' &&
    trigger !== 'BOOKING_CANCELLED'
  ) {
    return new Response(null, { status: 204 })
  }

  const p         = body.payload ?? {}
  const uid       = p.uid?.trim()
  const startTime = p.startTime
  const email     = p.attendees?.[0]?.email?.trim().toLowerCase() ?? null

  if (!uid) {
    return Response.json({ error: 'Missing booking uid' }, { status: 400 })
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  if (!email) {
    return skipped(supabase, `trigger=${trigger} uid=${uid} reason=missing_attendee_email`)
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, company_id, company_type')
    .ilike('email', email)
    .maybeSingle()

  if (!contact) {
    return skipped(supabase, `trigger=${trigger} uid=${uid} reason=unknown_attendee_email`)
  }

  const brandId =
    contact.company_type === 'brand' && contact.company_id ? contact.company_id : null

  // Pick the most recently-active open opportunity for this contact, if any.
  const { data: opps } = await supabase
    .from('opportunities')
    .select('id, stage, last_activity_at')
    .eq('contact_id', contact.id)
    .order('last_activity_at', { ascending: false, nullsFirst: false })
    .limit(10)

  const opportunityId =
    (opps ?? []).find((o) => o.stage !== 'won' && o.stage !== 'lost' && o.stage !== 'dormant')?.id ??
    null

  const existingTouchpoints = await findTouchpointsByBookingUid(supabase, uid)
  const existingCreated     = existingTouchpoints.length > 0

  // ── BOOKING_CREATED ────────────────────────────────────────────────────────
  if (trigger === 'BOOKING_CREATED') {
    if (existingCreated) {
      return skipped(supabase, `trigger=${trigger} uid=${uid} reason=duplicate`)
    }
    if (!startTime) {
      return skipped(supabase, `trigger=${trigger} uid=${uid} reason=missing_start_time`)
    }

    const title = p.title?.trim() || 'Cal.com booking'

    const { error: tpErr } = await supabase.from('touchpoints').insert({
      contact_id:  contact.id,
      brand_id:    brandId,
      type:        'meeting',
      note:        buildTouchpointNote(uid, `created — ${title} — ${startTime}`),
      occurred_at: startTime,
    })
    if (tpErr) {
      return failed(supabase, `trigger=${trigger} uid=${uid} error=${tpErr.message}`)
    }

    const dueAt = new Date(new Date(startTime).getTime() - 24 * 60 * 60 * 1000).toISOString()
    const { error: taskErr } = await supabase.from('tasks').insert({
      label:                 buildTaskLabel(uid, `Préparer brief — ${title}`),
      status:                'todo',
      due_at:                dueAt,
      linked_brand_id:       brandId,
      linked_contact_id:     contact.id,
      linked_opportunity_id: opportunityId,
    })
    if (taskErr) {
      return failed(supabase, `trigger=${trigger} uid=${uid} error=${taskErr.message}`)
    }

    return succeeded(supabase, `trigger=${trigger} uid=${uid} contact=${contact.id}`)
  }

  // RESCHEDULED / CANCELLED require a prior CREATED touchpoint.
  if (!existingCreated) {
    return skipped(supabase, `trigger=${trigger} uid=${uid} reason=no_prior_created`)
  }

  // ── BOOKING_RESCHEDULED ────────────────────────────────────────────────────
  if (trigger === 'BOOKING_RESCHEDULED') {
    const newStart = startTime?.trim() ?? ''
    const { error: tpErr } = await supabase.from('touchpoints').insert({
      contact_id:  contact.id,
      brand_id:    brandId,
      type:        'meeting',
      note:        buildTouchpointNote(uid, `rescheduled — new start ${newStart || 'unknown'}`),
      occurred_at: new Date().toISOString(),
    })
    if (tpErr) {
      return failed(supabase, `trigger=${trigger} uid=${uid} error=${tpErr.message}`)
    }

    if (newStart) {
      const task = await findTaskByBookingUid(supabase, uid)
      if (task) {
        const newDue = new Date(new Date(newStart).getTime() - 24 * 60 * 60 * 1000).toISOString()
        await supabase.from('tasks').update({ due_at: newDue }).eq('id', task.id)
      }
    }

    return succeeded(supabase, `trigger=${trigger} uid=${uid}`)
  }

  // ── BOOKING_CANCELLED ──────────────────────────────────────────────────────
  const reason = p.cancellationReason?.trim() || 'no reason provided'
  const { error: tpErr } = await supabase.from('touchpoints').insert({
    contact_id:  contact.id,
    brand_id:    brandId,
    type:        'meeting',
    note:        buildTouchpointNote(uid, `cancelled — ${reason}`),
    occurred_at: new Date().toISOString(),
  })
  if (tpErr) {
    return failed(supabase, `trigger=${trigger} uid=${uid} error=${tpErr.message}`)
  }

  const task = await findTaskByBookingUid(supabase, uid)
  if (task && task.status === 'todo') {
    await supabase.from('tasks').update({ status: 'snoozed' }).eq('id', task.id)
  }

  return succeeded(supabase, `trigger=${trigger} uid=${uid}`)
}
