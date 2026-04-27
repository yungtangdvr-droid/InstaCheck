import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import {
  AUDIENCE_DEMOGRAPHICS_SENTINEL_KEY,
  type SyncDemographicsResult,
  type TAudienceDemographicBreakdown,
  type TAudienceDemographicsTimeframe,
} from '@creator-hub/types'
import { fetchFollowerDemographics } from './instagram-client'

type AudienceDemographicsInsert =
  Database['public']['Tables']['raw_instagram_audience_demographics']['Insert']

const BREAKDOWNS: ReadonlyArray<TAudienceDemographicBreakdown> = [
  'country', 'city', 'age', 'gender',
]

export const DEFAULT_DEMOGRAPHICS_TIMEFRAME: TAudienceDemographicsTimeframe = 'last_30_days'

type Supabase = SupabaseClient<Database>

export async function syncFollowerDemographics(
  supabase:    Supabase,
  igUserId:    string,
  accessToken: string,
  timeframe:   TAudienceDemographicsTimeframe = DEFAULT_DEMOGRAPHICS_TIMEFRAME,
): Promise<SyncDemographicsResult> {
  const today = new Date().toISOString().split('T')[0]

  const result: SyncDemographicsResult = {
    timeframe,
    status:                   'unavailable',
    written:                  0,
    breakdownsAvailable:      [],
    breakdownsBelowThreshold: [],
    breakdownsUnavailable:    [],
  }

  for (const breakdown of BREAKDOWNS) {
    const outcome = await fetchFollowerDemographics({
      igUserId,
      accessToken,
      breakdown,
      timeframe,
    })

    const rows: AudienceDemographicsInsert[] = []

    if (outcome.status === 'available') {
      for (const r of outcome.rows) {
        rows.push({
          account_id:      igUserId,
          date:            today,
          timeframe,
          breakdown,
          key:             r.key,
          label:           null,
          value:           r.value,
          threshold_state: 'available',
          fetched_via:     'graph_api',
          reason:          null,
          raw_json:        outcome.raw as AudienceDemographicsInsert['raw_json'],
        })
      }
      result.breakdownsAvailable.push(breakdown)
    } else if (outcome.status === 'available_below_threshold') {
      rows.push({
        account_id:      igUserId,
        date:            today,
        timeframe,
        breakdown,
        key:             AUDIENCE_DEMOGRAPHICS_SENTINEL_KEY,
        label:           null,
        value:           0,
        threshold_state: 'available_below_threshold',
        fetched_via:     'graph_api',
        reason:          outcome.reason,
        raw_json:        outcome.raw as Database['public']['Tables']['raw_instagram_audience_demographics']['Insert']['raw_json'],
      })
      result.breakdownsBelowThreshold.push(breakdown)
    } else {
      // 'unavailable'
      rows.push({
        account_id:      igUserId,
        date:            today,
        timeframe,
        breakdown,
        key:             AUDIENCE_DEMOGRAPHICS_SENTINEL_KEY,
        label:           null,
        value:           0,
        threshold_state: 'unavailable',
        fetched_via:     'graph_api',
        reason:          outcome.reason,
        raw_json:        outcome.raw as Database['public']['Tables']['raw_instagram_audience_demographics']['Insert']['raw_json'],
      })
      result.breakdownsUnavailable.push(breakdown)
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from('raw_instagram_audience_demographics')
        .upsert(rows, { onConflict: 'account_id,date,timeframe,breakdown,key' })

      if (error) {
        throw new Error(
          `raw_instagram_audience_demographics upsert (${breakdown}): ${error.message}`,
        )
      }
      result.written += rows.length
    }
  }

  if (result.breakdownsAvailable.length === BREAKDOWNS.length) {
    result.status = 'available'
  } else if (result.breakdownsAvailable.length === 0) {
    result.status = 'unavailable'
  } else {
    result.status = 'partial'
  }

  return result
}
