import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { TUmamiEvent } from '@creator-hub/types'
import { fetchEvents, type UmamiClientConfig } from './umami-client'

type Supabase = SupabaseClient<Database>

const LOOKBACK_MINUTES  = 30
const COLD_START_HOURS  = 2
const FETCH_PAGE_LIMIT  = 1000

export type UmamiSyncOutcome = {
  fetched:     number
  inserted:    number
  windowStart: string
  windowEnd:   string
}

export async function syncUmamiEvents(
  supabase: Supabase,
  config:   UmamiClientConfig,
  now:      Date = new Date(),
): Promise<UmamiSyncOutcome> {
  const { data: latest } = await supabase
    .from('raw_umami_events')
    .select('occurred_at')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const endAt = now.getTime()
  const startAt = latest?.occurred_at
    ? new Date(latest.occurred_at).getTime() - LOOKBACK_MINUTES * 60 * 1000
    : endAt - COLD_START_HOURS * 60 * 60 * 1000

  const events = await fetchEvents(config, {
    startAt,
    endAt,
    limit: FETCH_PAGE_LIMIT,
  })

  const rows = events.map(toRawEventInsert)

  let inserted = 0
  if (rows.length > 0) {
    const { data } = await supabase
      .from('raw_umami_events')
      .upsert(rows, { onConflict: 'event_id', ignoreDuplicates: true })
      .select('id')
    inserted = data?.length ?? 0
  }

  return {
    fetched:     events.length,
    inserted,
    windowStart: new Date(startAt).toISOString(),
    windowEnd:   new Date(endAt).toISOString(),
  }
}

function toRawEventInsert(
  event: TUmamiEvent,
): Database['public']['Tables']['raw_umami_events']['Insert'] {
  const fullUrl = event.urlQuery
    ? `${event.urlPath}${event.urlQuery.startsWith('?') ? '' : '?'}${event.urlQuery}`
    : event.urlPath

  const referrer =
    event.referrerDomain || event.referrerPath
      ? [event.referrerDomain, event.referrerPath].filter(Boolean).join('')
      : null

  return {
    event_id:    event.id,
    session_id:  event.sessionId ?? '',
    url:         fullUrl || '',
    event_name:  event.eventName ?? '',
    referrer,
    occurred_at: event.createdAt,
  }
}
