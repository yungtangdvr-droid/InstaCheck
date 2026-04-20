import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../types/supabase'
import type { SyncMediaResult } from '../../types/index'
import { fetchAllMedia } from './instagram-client'

export async function syncMedia(
  supabase: ReturnType<typeof createClient<Database>>,
  igUserId: string,
  accessToken: string,
  accountRowId: string
): Promise<SyncMediaResult> {
  const mediaList = await fetchAllMedia(igUserId, accessToken)

  let created = 0
  let updated = 0

  for (const media of mediaList) {
    // Upsert raw_instagram_media
    const { error: rawErr } = await supabase
      .from('raw_instagram_media')
      .upsert(
        {
          media_id:   media.id,
          account_id: igUserId,
          media_type: media.media_type,
          caption:    media.caption ?? null,
          permalink:  media.permalink,
          timestamp:  media.timestamp,
          raw_json:   media as unknown as Database['public']['Tables']['raw_instagram_media']['Insert']['raw_json'],
        },
        { onConflict: 'media_id' }
      )

    if (rawErr) throw new Error(`raw_instagram_media upsert ${media.id}: ${rawErr.message}`)

    // Upsert posts table
    const { data: existing } = await supabase
      .from('posts')
      .select('id')
      .eq('media_id', media.id)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('posts')
        .update({
          media_type: media.media_type,
          caption:    media.caption ?? null,
          permalink:  media.permalink,
          posted_at:  media.timestamp,
        })
        .eq('id', existing.id)
      if (error) throw new Error(`posts update ${media.id}: ${error.message}`)
      updated++
    } else {
      const { error } = await supabase.from('posts').insert({
        account_id: accountRowId,
        media_id:   media.id,
        media_type: media.media_type,
        caption:    media.caption ?? null,
        permalink:  media.permalink,
        posted_at:  media.timestamp,
      })
      if (error) throw new Error(`posts insert ${media.id}: ${error.message}`)
      created++
    }
  }

  return { total: mediaList.length, created, updated }
}
