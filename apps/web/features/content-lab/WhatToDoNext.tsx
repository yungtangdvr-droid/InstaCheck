import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ContentLabPost } from '@creator-hub/types'
import { ReplicablePostCard } from './ReplicablePostCard'

export async function WhatToDoNext() {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_mart_post_performance')
    .select('post_id, media_id, media_type, caption, permalink, posted_at, tags, total_saves, total_shares, total_comments, total_likes, total_profile_visits, total_reach, performance_score')
    .eq('in_last_30d', true)
    .order('performance_score', { ascending: false })
    .order('post_id', { ascending: true })
    .limit(3)

  if (error || !data || data.length === 0) {
    return (
      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">Quoi poster ensuite ?</h2>
        <p className="text-sm text-neutral-500">
          Aucun post indexé. Lance un sync Instagram d&apos;abord.
        </p>
      </section>
    )
  }

  const top3: ContentLabPost[] = data.map(r => ({
    id:        r.post_id,
    mediaId:   r.media_id,
    mediaType: r.media_type,
    caption:   r.caption,
    permalink: r.permalink,
    postedAt:  r.posted_at,
    metrics: {
      saves:         r.total_saves,
      shares:        r.total_shares,
      comments:      r.total_comments,
      likes:         r.total_likes,
      profileVisits: r.total_profile_visits,
      reach:         r.total_reach,
    },
    tags:  r.tags,
    score: r.performance_score,
  }))

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-white">Quoi poster ensuite ?</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Top posts à répliquer selon saves, shares et engagement (30 derniers jours)
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {top3.map((post) => (
          <ReplicablePostCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  )
}
