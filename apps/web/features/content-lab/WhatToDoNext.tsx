import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ContentLabPost } from '@creator-hub/types'
import { ReplicablePostCard } from './ReplicablePostCard'
import { computePercentiles, computeRankScore } from '@/features/analytics/ranking'
import { extractPreviewUrls } from '@/features/analytics/media-preview'
import { getContentSignalsForPosts } from './get-content-analysis'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

// Hard cap on the candidate pool pulled into JS for percentile ranking. The
// 30 d window on this account is well under 500; if it ever grows, only the
// top-performance_score rows are kept — they are the only ones whose rank
// will matter for the "top 3 to replicate" card.
const CONTENT_LAB_CANDIDATE_CAP = 500

export async function WhatToDoNext() {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_mart_post_performance')
    .select('post_id, media_id, media_type, caption, permalink, posted_at, tags, total_saves, total_shares, total_comments, total_likes, total_profile_visits, total_reach, performance_score, score_delta, baseline_saves, baseline_shares, baseline_comments, baseline_likes, baseline_profile_visits')
    .eq('in_last_30d', true)
    .order('performance_score', { ascending: false })
    .order('post_id', { ascending: true })
    .limit(CONTENT_LAB_CANDIDATE_CAP)

  if (error || !data || data.length === 0) {
    return (
      <section className="space-y-3">
        <SectionHeader
          title="Quoi poster ensuite ?"
          description="Top posts à répliquer selon le score de circulation."
        />
        <EmptyState
          title="Aucun post indexé"
          description="Lance un sync Instagram d'abord pour alimenter les recommandations."
        />
      </section>
    )
  }

  const mediaIds = Array.from(
    new Set(data.map(r => r.media_id).filter((m): m is string => Boolean(m)))
  )
  const previewByMediaId = new Map<string, { previewUrl: string | null; thumbnailUrl: string | null }>()
  if (mediaIds.length > 0) {
    const { data: rawMedia } = await supabase
      .from('raw_instagram_media')
      .select('media_id, raw_json')
      .in('media_id', mediaIds)
    for (const row of rawMedia ?? []) {
      previewByMediaId.set(row.media_id, extractPreviewUrls(row.raw_json, row.media_id))
    }
  }

  const enriched = data.map(r => {
    const saves         = Number(r.total_saves         ?? 0)
    const shares        = Number(r.total_shares        ?? 0)
    const comments      = Number(r.total_comments      ?? 0)
    const likes         = Number(r.total_likes         ?? 0)
    const profileVisits = Number(r.total_profile_visits ?? 0)

    const baselineSaves         = r.baseline_saves          == null ? null : Number(r.baseline_saves)
    const baselineShares        = r.baseline_shares         == null ? null : Number(r.baseline_shares)
    const baselineComments      = r.baseline_comments       == null ? null : Number(r.baseline_comments)
    const baselineLikes         = r.baseline_likes          == null ? null : Number(r.baseline_likes)
    const baselineProfileVisits = r.baseline_profile_visits == null ? null : Number(r.baseline_profile_visits)

    const rankScore = computeRankScore({
      saves, shares, comments, likes, profileVisits,
      baselineSaves, baselineShares, baselineComments, baselineLikes, baselineProfileVisits,
    })

    const savesMultiplier =
      baselineSaves && baselineSaves > 0 ? saves / baselineSaves : null

    const mediaId = r.media_id ?? ''
    const preview = previewByMediaId.get(mediaId) ?? { previewUrl: null, thumbnailUrl: null }

    return {
      id:        r.post_id    ?? '',
      mediaId,
      mediaType: r.media_type ?? 'UNKNOWN',
      caption:   r.caption,
      permalink: r.permalink,
      postedAt:  r.posted_at,
      metrics: {
        saves,
        shares,
        comments,
        likes,
        profileVisits,
        reach: Number(r.total_reach ?? 0),
      },
      tags:            r.tags ?? [],
      score:           r.performance_score ?? 0,
      scoreDelta:      r.score_delta       ?? 0,
      savesMultiplier,
      rankScore,
      percentile:      null as number | null,
      previewUrl:      preview.previewUrl,
      thumbnailUrl:    preview.thumbnailUrl,
    }
  })

  const ranked = computePercentiles(enriched)

  const top3: ContentLabPost[] = ranked
    .slice()
    .sort((a, b) => {
      const ra = a.rankScore
      const rb = b.rankScore
      if (ra != null && rb != null) return rb - ra
      if (ra != null) return -1
      if (rb != null) return  1
      if (b.score !== a.score) return b.score - a.score
      return a.id.localeCompare(b.id)
    })
    .slice(0, 3)

  const sampleSize = ranked.filter(p => p.rankScore != null).length

  // Read-only content analysis signals for the surfaced top 3. Plain object
  // so it serialises across the RSC boundary into the client card.
  const signalMap = await getContentSignalsForPosts(supabase, top3.map(p => p.id))

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Quoi poster ensuite ?"
        description="Top posts à répliquer selon le score de circulation (shares, saves, profil) sur 30 j."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {top3.map((post) => {
          const signal = signalMap.get(post.id)
          return (
            <ReplicablePostCard
              key={post.id}
              post={post}
              sampleSize={sampleSize}
              contentSignal={signal ? {
                primaryTheme:         signal.primaryTheme,
                formatPattern:        signal.formatPattern,
                replicationPotential: signal.replicationPotential,
              } : null}
            />
          )
        })}
      </div>
    </section>
  )
}
