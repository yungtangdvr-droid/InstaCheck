import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ContentLabPost } from '@creator-hub/types'
import { ReplicablePostCard } from './ReplicablePostCard'

// Mirrors @creator-hub/scoring scorePost weights.
// Wire via tsconfig paths once @creator-hub/scoring is added to web app dependencies.
function computeScore(
  m: { saves: number; shares: number; comments: number; likes: number; profileVisits: number },
  b: { saves: number; shares: number; comments: number; likes: number; profileVisits: number },
): number {
  const n = (v: number, base: number) => (base === 0 ? 0 : Math.min(v / base, 2))
  const raw =
    0.35 * n(m.saves, b.saves) +
    0.30 * n(m.shares, b.shares) +
    0.15 * n(m.comments, b.comments) +
    0.10 * n(m.likes, b.likes) +
    0.10 * n(m.profileVisits, b.profileVisits)
  return Math.round(Math.min(raw, 1) * 100)
}

const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10)

export async function WhatToDoNext() {
  const supabase = await createServerSupabaseClient()

  const { data: posts } = await supabase
    .from('posts')
    .select('id, media_id, media_type, caption, permalink, posted_at')
    .order('posted_at', { ascending: false })
    .limit(50)

  if (!posts || posts.length === 0) {
    return (
      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">Quoi poster ensuite ?</h2>
        <p className="text-sm text-neutral-500">
          Aucun post indexé. Lance un sync Instagram d'abord.
        </p>
      </section>
    )
  }

  const postIds = posts.map((p) => p.id)

  const [{ data: metrics }, { data: allTags }] = await Promise.all([
    supabase
      .from('post_metrics_daily')
      .select('post_id, saves, shares, comments, likes, profile_visits, reach')
      .in('post_id', postIds)
      .gte('date', THIRTY_DAYS_AGO),
    supabase.from('post_tags').select('post_id, tag').in('post_id', postIds),
  ])

  type MetricSums = {
    saves: number; shares: number; comments: number
    likes: number; profileVisits: number; reach: number
  }

  const metricMap = new Map<string, MetricSums>()
  for (const row of metrics ?? []) {
    const cur = metricMap.get(row.post_id) ?? {
      saves: 0, shares: 0, comments: 0, likes: 0, profileVisits: 0, reach: 0,
    }
    metricMap.set(row.post_id, {
      saves:         cur.saves         + (row.saves          ?? 0),
      shares:        cur.shares        + (row.shares         ?? 0),
      comments:      cur.comments      + (row.comments       ?? 0),
      likes:         cur.likes         + (row.likes          ?? 0),
      profileVisits: cur.profileVisits + (row.profile_visits ?? 0),
      reach:         cur.reach         + (row.reach          ?? 0),
    })
  }

  const tagMap = new Map<string, string[]>()
  for (const t of allTags ?? []) {
    tagMap.set(t.post_id, [...(tagMap.get(t.post_id) ?? []), t.tag])
  }

  const allM = [...metricMap.values()]
  const avg = (key: keyof MetricSums) =>
    allM.length === 0 ? 1 : allM.reduce((s, m) => s + m[key], 0) / allM.length || 1
  const baseline = {
    saves:         avg('saves'),
    shares:        avg('shares'),
    comments:      avg('comments'),
    likes:         avg('likes'),
    profileVisits: avg('profileVisits'),
  }

  const labPosts: ContentLabPost[] = posts.map((p) => {
    const m = metricMap.get(p.id) ?? {
      saves: 0, shares: 0, comments: 0, likes: 0, profileVisits: 0, reach: 0,
    }
    return {
      id:        p.id,
      mediaId:   p.media_id,
      mediaType: p.media_type,
      caption:   p.caption,
      permalink: p.permalink,
      postedAt:  p.posted_at,
      metrics:   m,
      tags:      tagMap.get(p.id) ?? [],
      score:     computeScore(m, baseline),
    }
  })

  const top3 = [...labPosts].sort((a, b) => b.score - a.score).slice(0, 3)

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
