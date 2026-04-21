'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ActionResult, ContentRecommendationType } from '@creator-hub/types'

export async function addTag(postId: string, tag: string): Promise<ActionResult<null>> {
  const supabase = await createServerSupabaseClient()
  const trimmed = tag.trim().toLowerCase()
  if (!trimmed) return { data: null, error: 'Tag cannot be empty' }

  const { error } = await supabase
    .from('post_tags')
    .insert({ post_id: postId, tag: trimmed })

  if (error && error.code !== '23505') {
    return { data: null, error: error.message }
  }
  return { data: null, error: null }
}

export async function removeTag(postId: string, tag: string): Promise<ActionResult<null>> {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('post_tags')
    .delete()
    .eq('post_id', postId)
    .eq('tag', tag)

  if (error) return { data: null, error: error.message }
  return { data: null, error: null }
}

export async function upsertRecommendation(
  postId: string,
  type: ContentRecommendationType,
  reason: string,
): Promise<ActionResult<null>> {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('content_recommendations')
    .insert({ post_id: postId, type, reason })

  if (error) return { data: null, error: error.message }
  return { data: null, error: null }
}
