import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { SyncMediaResult } from '@creator-hub/types'
import { fetchAllMedia } from './instagram-client'

const DEFAULT_MEDIA_SYNC_LIMIT = 200

function resolveMediaSyncLimit(): number {
  const raw = process.env.META_SYNC_MEDIA_LIMIT
  if (!raw) return DEFAULT_MEDIA_SYNC_LIMIT
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MEDIA_SYNC_LIMIT
}

export async function syncMedia(
  supabase: ReturnType<typeof createClient<Database>>,
  igUserId: string,
  accessToken: string,
  accountRowId: string
): Promise<SyncMediaResult> {
  const limit = resolveMediaSyncLimit()
  const mediaList = await fetchAllMedia(igUserId, accessToken, limit)

  let created = 0
  let updated = 0

  for (const media of mediaList) {
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

  return {
    total:     mediaList.length,
    created,
    updated,
    limit,
    processed: created + updated,
  }
}
