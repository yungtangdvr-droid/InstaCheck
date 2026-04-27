import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { FullSyncResult, SyncDemographicsResult } from '@creator-hub/types'
import { syncAccount } from './sync-account'
import { syncMedia } from './sync-media'
import { syncInsightsForAllPosts } from './sync-insights'
import { syncFollowerDemographics } from './sync-demographics'

export { fetchAccount, fetchAllMedia, fetchMediaInsights, fetchFollowerDemographics } from './instagram-client'
export { syncAccount } from './sync-account'
export { syncMedia } from './sync-media'
export { syncInsightsForMedia, syncInsightsForAllPosts } from './sync-insights'
export { syncFollowerDemographics, DEFAULT_DEMOGRAPHICS_TIMEFRAME } from './sync-demographics'

export async function runFullSync(config: {
  supabaseUrl:  string
  supabaseKey:  string
  igUserId:     string
  accessToken:  string
}): Promise<FullSyncResult> {
  const start = Date.now()
  const errors: string[] = []

  const supabase = createClient<Database>(config.supabaseUrl, config.supabaseKey)

  const accountResult = await syncAccount(supabase, config.igUserId, config.accessToken)

  const { data: accountRow } = await supabase
    .from('accounts')
    .select('id')
    .eq('instagram_id', config.igUserId)
    .single()

  if (!accountRow) throw new Error('Account row not found after sync')

  const mediaResult = await syncMedia(
    supabase,
    config.igUserId,
    config.accessToken,
    accountRow.id
  )

  let insightsResults: FullSyncResult['insights'] = []
  try {
    const { results, errors: insightErrors } = await syncInsightsForAllPosts(
      supabase,
      accountRow.id,
      config.accessToken
    )
    insightsResults = results
    if (insightErrors.length) {
      errors.push(...insightErrors)
      console.error(`[fullSync] ${insightErrors.length} insight error(s); first: ${insightErrors[0]}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'insights sync failed'
    errors.push(msg)
    console.error('[fullSync] insights error:', msg)
  }

  let demographicsResult: SyncDemographicsResult | null = null
  try {
    demographicsResult = await syncFollowerDemographics(
      supabase,
      config.igUserId,
      config.accessToken,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'demographics sync failed'
    errors.push(msg)
    console.error('[fullSync] demographics error:', msg)
  }

  return {
    account:      accountResult,
    media:        mediaResult,
    insights:     insightsResults,
    demographics: demographicsResult,
    errors,
    durationMs:   Date.now() - start,
  }
}
