import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

/**
 * Single source of truth for the Cal.com booking identity marker.
 *
 * Every touchpoint created by the Cal.com webhook starts with
 *   calcom_booking_uid:<uid>\n
 * and every prep task label starts with
 *   [calcom_booking_uid:<uid>]
 *
 * All write / lookup of these markers goes through this file — do not
 * string-match on `calcom_booking_uid:` elsewhere.
 */

const TOUCHPOINT_PREFIX = 'calcom_booking_uid:'
const TASK_OPEN         = '[calcom_booking_uid:'
const TASK_CLOSE        = ']'

type Supabase = SupabaseClient<Database>

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export function buildTouchpointNote(uid: string, body: string): string {
  return `${TOUCHPOINT_PREFIX}${uid}\n${body}`
}

export function buildTaskLabel(uid: string, body: string): string {
  return `${TASK_OPEN}${uid}${TASK_CLOSE} ${body}`
}

function noteMatchesUid(note: string | null, uid: string): boolean {
  if (!note) return false
  const head = `${TOUCHPOINT_PREFIX}${uid}`
  return note === head || note.startsWith(`${head}\n`)
}

function labelMatchesUid(label: string | null | undefined, uid: string): boolean {
  if (!label) return false
  return label.startsWith(`${TASK_OPEN}${uid}${TASK_CLOSE}`)
}

export type CalcomTouchpointRow = {
  id:          string
  note:        string | null
  occurred_at: string
  contact_id:  string | null
  brand_id:    string | null
}

export async function findTouchpointsByBookingUid(
  supabase: Supabase,
  uid: string,
): Promise<CalcomTouchpointRow[]> {
  const head = `${TOUCHPOINT_PREFIX}${uid}`
  const { data } = await supabase
    .from('touchpoints')
    .select('id, note, occurred_at, contact_id, brand_id')
    .like('note', `${escapeLike(head)}%`)
    .order('occurred_at', { ascending: true })
  return (data ?? []).filter((row) => noteMatchesUid(row.note, uid))
}

export type CalcomTaskRow = {
  id:     string
  status: string
  due_at: string | null
}

export async function findTaskByBookingUid(
  supabase: Supabase,
  uid: string,
): Promise<CalcomTaskRow | null> {
  const prefix = `${TASK_OPEN}${uid}${TASK_CLOSE}`
  const { data } = await supabase
    .from('tasks')
    .select('id, status, due_at, label, created_at')
    .like('label', `${escapeLike(prefix)}%`)
    .order('created_at', { ascending: true })
    .limit(5)
  const match = (data ?? []).find((row) => labelMatchesUid(row.label, uid))
  return match ? { id: match.id, status: match.status, due_at: match.due_at } : null
}
