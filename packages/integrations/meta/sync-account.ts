import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../types/supabase'
import type { SyncAccountResult } from '../../types/index'
import { fetchAccount } from './instagram-client'

export async function syncAccount(
  supabase: ReturnType<typeof createClient<Database>>,
  igUserId: string,
  accessToken: string
): Promise<SyncAccountResult> {
  const account = await fetchAccount(igUserId, accessToken)

  // Upsert account record
  const { error: upsertErr } = await supabase
    .from('accounts')
    .upsert(
      {
        instagram_id: account.id,
        username: account.username,
        avatar_url: account.profile_picture_url ?? null,
      },
      { onConflict: 'instagram_id' }
    )

  if (upsertErr) throw new Error(`accounts upsert: ${upsertErr.message}`)

  // Insert daily snapshot
  const today = new Date().toISOString().split('T')[0]
  const { error: snapshotErr } = await supabase
    .from('raw_instagram_account_daily')
    .upsert(
      {
        account_id:      account.id,
        date:            today,
        followers_count: account.followers_count ?? null,
        reach:           null,
        impressions:     null,
      },
      { onConflict: 'account_id,date' }
    )

  if (snapshotErr) throw new Error(`raw_instagram_account_daily upsert: ${snapshotErr.message}`)

  return {
    accountId:    account.id,
    username:     account.username,
    insertedRows: 1,
  }
}
