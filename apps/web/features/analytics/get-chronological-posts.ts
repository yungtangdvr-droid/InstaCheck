// Read-only chronological feed of synced Instagram posts.
//
// Distinct from `getTopPosts` (which sorts by ranked / circulation score and
// is the primary `/analytics` table): this function returns every post in the
// requested period ordered by `posted_at desc`, so the operator can browse
// recent activity without performance bias.
//
// Joins:
//   - v_mart_post_performance for posted_at, media_type, caption, totals, and
//     baseline rates required to compute the same circulation score the rest
//     of the app surfaces.
//   - raw_instagram_media.raw_json for the preview thumbnail (signed Meta
//     CDN URL — best-effort, expires).
//   - post_content_analysis for the optional theme chip.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { TAnalyticsPeriod } from '@creator-hub/types'
import {
  baselineRatesForPost,
  computeDistributionScore,
  computeFormatRateMedians,
  type TDistributionLabel,
  type TDistributionSignal,
} from './engagement-score'
import { extractPreviewUrls } from './media-preview'

type Supabase = SupabaseClient<Database>

export type TChronologicalPost = {
  id:               string
  mediaId:          string
  mediaType:        string
  caption:          string | null
  permalink:        string | null
  postedAt:         string | null
  reach:            number
  saves:            number
  shares:           number
  // Same circulation score the rest of the app uses, so the chronological
  // feed can be cross-referenced with PostExplorer without a scale shift.
  // Null when the mart didn't ship a baseline (e.g. brand-new format).
  circulationScore: number | null
  circulationLabel: TDistributionLabel | null
  dominantSignal:   TDistributionSignal | null
  primaryTheme:     string | null
  previewUrl:       string | null
  thumbnailUrl:     string | null
}

function periodFlagColumn(period: TAnalyticsPeriod): 'in_last_7d' | 'in_last_30d' | 'in_last_90d' {
  if (period === 7)  return 'in_last_7d'
  if (period === 30) return 'in_last_30d'
  return 'in_last_90d'
}

// Same safety cap used by getTopPosts — at one post a day for a year we stay
// well under it, but the hard limit keeps a stray query bounded.
const CHRONO_POSTS_CAP = 500

export async function getChronologicalPosts(
  supabase: Supabase,
  period:   TAnalyticsPeriod,
): Promise<TChronologicalPost[]> {
  const flag = periodFlagColumn(period)

  const { data, error } = await supabase
    .from('v_mart_post_performance')
    .select('post_id, media_id, media_type, caption, permalink, posted_at, total_reach, total_saves, total_shares, total_likes, total_comments, total_profile_visits, baseline_saves, baseline_shares, baseline_comments, baseline_likes, baseline_profile_visits')
    .eq(flag, true)
    .order('posted_at', { ascending: false, nullsFirst: false })
    .limit(CHRONO_POSTS_CAP)

  if (error || !data) return []
  if (data.length === 0) return []

  const postIds  = data.map((r) => r.post_id).filter((id): id is string => typeof id === 'string')
  const mediaIds = Array.from(
    new Set(data.map((r) => r.media_id).filter((m): m is string => typeof m === 'string')),
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

  const themeByPostId = new Map<string, string | null>()
  if (postIds.length > 0) {
    const { data: themes } = await supabase
      .from('post_content_analysis')
      .select('post_id, primary_theme, status')
      .in('post_id', postIds)
      .eq('status', 'completed')
    for (const t of themes ?? []) {
      themeByPostId.set(t.post_id, t.primary_theme ?? null)
    }
  }

  const formatRateMedians = computeFormatRateMedians(data)

  const result: TChronologicalPost[] = data.map((r) => {
    const reach    = Number(r.total_reach    ?? 0)
    const saves    = Number(r.total_saves    ?? 0)
    const shares   = Number(r.total_shares   ?? 0)
    const comments = Number(r.total_comments ?? 0)
    const likes    = Number(r.total_likes    ?? 0)
    const pv       = r.total_profile_visits == null ? null : Number(r.total_profile_visits)

    // Reach == 0 means the post hasn't accrued distribution data yet (just
    // synced, or zero reach reported). Skip the score so the UI can render
    // a neutral "—" rather than a 0/100 that reads as poor performance.
    const eng = reach > 0
      ? computeDistributionScore({
          reach,
          shares,
          saves,
          comments,
          likes,
          profileVisits: pv,
          baselineRates: baselineRatesForPost(r, formatRateMedians),
        })
      : null

    const mediaId = r.media_id ?? ''
    const preview = previewByMediaId.get(mediaId) ?? { previewUrl: null, thumbnailUrl: null }

    return {
      id:               r.post_id    ?? '',
      mediaId,
      mediaType:        r.media_type ?? 'UNKNOWN',
      caption:          r.caption ?? null,
      permalink:        r.permalink ?? null,
      postedAt:         r.posted_at ?? null,
      reach,
      saves,
      shares,
      circulationScore: eng?.score ?? null,
      circulationLabel: eng?.label ?? null,
      dominantSignal:   eng?.dominantSignal ?? null,
      primaryTheme:     themeByPostId.get(r.post_id ?? '') ?? null,
      previewUrl:       preview.previewUrl,
      thumbnailUrl:     preview.thumbnailUrl,
    }
  })

  return result
}
