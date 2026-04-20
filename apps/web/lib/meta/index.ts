import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { FullSyncResult } from '@creator-hub/types'
import { syncAccount } from './sync-account'
import { syncMedia } from './sync-media'
import { syncInsightsForAllPosts } from './sync-insights'

export { fetchAccount, fetchAllMedia, fetchMediaInsights } from './instagram-client'
export { syncAccount } from './sync-account'
export { syncMedia } from './sync-media'
export { syncInsightsForMedia, syncInsightsForAllPosts } from './sync-insights'

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
    insightsResults = await syncInsightsForAllPosts(
      supabase,
      config.igUserId,
      config.accessToken
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'insights sync failed'
    errors.push(msg)
    console.error('[fullSync] insights error:', msg)
  }

  return {
    account:    accountResult,
    media:      mediaResult,
    insights:   insightsResults,
    errors,
    durationMs: Date.now() - start,
  }
}
