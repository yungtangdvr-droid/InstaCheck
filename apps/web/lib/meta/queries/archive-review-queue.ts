import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

// Read-only helper that builds the Archive Prioritization Queue V1.
// Gating + sort + pagination happen here. Scoring is deterministic
// (no AI, no embeddings) and runs server-side over the gated set.

export const ARCHIVE_REVIEW_DEFAULT_PAGE_SIZE = 25

// Maximum number of gated rows we score in memory per request. The
// archive holds ~28k posts on this account, so we will routinely score
// only a window of the eligible set (most-recent first). The exact
// `eligibleTotal` is reported separately so the UI can show how much
// of the pool is being analysed.
export const ARCHIVE_REVIEW_CANDIDATE_WINDOW = 2000

// Diversity bonus: top-N most-recent posts per (media_type, year-month).
const REPRESENTATIVE_SAMPLE_PER_BUCKET = 3

const RECENT_90D_MS  = 90  * 24 * 60 * 60 * 1000
const RECENT_365D_MS = 365 * 24 * 60 * 60 * 1000

export type ArchiveReviewReason =
  | 'caption_present'
  | 'metrics_available'
  | 'recent_90d'
  | 'recent_365d'
  | 'representative_sample'

export type ArchiveReviewItem = {
  postId:                   string
  mediaId:                  string
  mediaType:                Database['public']['Enums']['media_type']
  permalink:                string
  caption:                  string | null
  postedAt:                 string
  archiveMetadataStatus:    string
  archiveHumanReviewStatus: string
  metrics: {
    available: boolean
    likes:     number | null
    comments:  number | null
    asOfDate:  string | null
  }
  score:    number
  reasons:  ArchiveReviewReason[]
}

export type ArchiveReviewKpis = {
  eligibleTotal:         number
  candidateWindow:       number
  candidateWindowLimit:  number
  captionPresentShare:   number
  withMetricsShare:      number
}

export type ArchiveReviewQueue = {
  items:                 ArchiveReviewItem[]
  total:                 number
  page:                  number
  pageSize:              number
  windowed:              boolean
  candidateWindowLimit:  number
  kpis:                  ArchiveReviewKpis
}

type Db = SupabaseClient<Database>

type GatedRow = {
  id:         string
  media_id:   string
  media_type: Database['public']['Enums']['media_type']
  caption:    string | null
  permalink:  string
  posted_at:  string
  post_archive_state: {
    metadata_status:     string
    human_review_status: string
  }
}

type LatestMetric = {
  date:     string
  likes:    number | null
  comments: number | null
}

function hasCaption(caption: string | null): boolean {
  return typeof caption === 'string' && caption.trim().length > 0
}

function yearMonthKey(isoDate: string): string {
  // Bucket by UTC year-month so the diversity window is stable regardless
  // of the server timezone the page renders in.
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function getArchiveReviewQueue(
  supabase: Db,
  opts: { page?: number; pageSize?: number } = {}
): Promise<ArchiveReviewQueue> {
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? ARCHIVE_REVIEW_DEFAULT_PAGE_SIZE, 100))
  const page     = Math.max(1, opts.page ?? 1)

  // ----- Gated total (single-tenant, exact count) ----------------------
  const totalRes = await supabase
    .from('posts')
    .select('id, post_archive_state!inner(metadata_status, human_review_status)', {
      head:  true,
      count: 'exact',
    })
    .eq('post_archive_state.metadata_status',     'imported')
    .eq('post_archive_state.human_review_status', 'pending')
  if (totalRes.error) {
    throw new Error(`archive review total count failed: ${totalRes.error.message}`)
  }
  const eligibleTotal = totalRes.count ?? 0

  if (eligibleTotal === 0) {
    return {
      items:                [],
      total:                0,
      page:                 1,
      pageSize,
      windowed:             false,
      candidateWindowLimit: ARCHIVE_REVIEW_CANDIDATE_WINDOW,
      kpis: {
        eligibleTotal:        0,
        candidateWindow:      0,
        candidateWindowLimit: ARCHIVE_REVIEW_CANDIDATE_WINDOW,
        captionPresentShare:  0,
        withMetricsShare:     0,
      },
    }
  }

  // ----- Gated candidate pool ------------------------------------------
  const gatedRes = await supabase
    .from('posts')
    .select(`
      id,
      media_id,
      media_type,
      caption,
      permalink,
      posted_at,
      post_archive_state!inner ( metadata_status, human_review_status )
    `)
    .eq('post_archive_state.metadata_status',     'imported')
    .eq('post_archive_state.human_review_status', 'pending')
    .order('posted_at', { ascending: false })
    .order('id',        { ascending: true })
    .limit(ARCHIVE_REVIEW_CANDIDATE_WINDOW)
  if (gatedRes.error) {
    throw new Error(`archive review gated query failed: ${gatedRes.error.message}`)
  }
  const gated = (gatedRes.data ?? []) as unknown as GatedRow[]
  const windowed = eligibleTotal > gated.length

  // ----- Latest metrics per post (best-effort) -------------------------
  const postIds = gated.map((r) => r.id)
  const latestMetrics = new Map<string, LatestMetric>()
  if (postIds.length > 0) {
    const metricsRes = await supabase
      .from('post_metrics_daily')
      .select('post_id, date, likes, comments')
      .in('post_id', postIds)
      .order('date', { ascending: false })
    if (metricsRes.error) {
      throw new Error(`archive review metrics query failed: ${metricsRes.error.message}`)
    }
    for (const row of metricsRes.data ?? []) {
      // Rows are date-desc; first one wins per post_id.
      if (!latestMetrics.has(row.post_id)) {
        latestMetrics.set(row.post_id, {
          date:     row.date,
          likes:    row.likes ?? null,
          comments: row.comments ?? null,
        })
      }
    }
  }

  // ----- Representative-sample buckets ---------------------------------
  // For each (media_type, year-month) bucket, the N most-recent posts get
  // the representative bonus. `gated` is already sorted posted_at desc.
  const bucketCounts = new Map<string, number>()
  const representativeIds = new Set<string>()
  for (const row of gated) {
    const key = `${row.media_type}__${yearMonthKey(row.posted_at)}`
    const seen = bucketCounts.get(key) ?? 0
    if (seen < REPRESENTATIVE_SAMPLE_PER_BUCKET) {
      representativeIds.add(row.id)
      bucketCounts.set(key, seen + 1)
    }
  }

  // ----- Scoring -------------------------------------------------------
  const now = Date.now()
  let captionPresentCount = 0
  let withMetricsCount    = 0

  const scored: ArchiveReviewItem[] = gated.map((row) => {
    const metric = latestMetrics.get(row.id) ?? null
    const reasons: ArchiveReviewReason[] = []
    let score = 0

    if (hasCaption(row.caption)) {
      score += 3
      reasons.push('caption_present')
      captionPresentCount += 1
    }

    if (metric) {
      score += 2
      reasons.push('metrics_available')
      withMetricsCount += 1
    }

    const postedAtMs = new Date(row.posted_at).getTime()
    if (Number.isFinite(postedAtMs)) {
      const age = now - postedAtMs
      if (age <= RECENT_90D_MS) {
        score += 2
        reasons.push('recent_90d')
      } else if (age <= RECENT_365D_MS) {
        score += 1
        reasons.push('recent_365d')
      }
    }

    if (representativeIds.has(row.id)) {
      score += 1
      reasons.push('representative_sample')
    }

    return {
      postId:                   row.id,
      mediaId:                  row.media_id,
      mediaType:                row.media_type,
      permalink:                row.permalink,
      caption:                  row.caption,
      postedAt:                 row.posted_at,
      archiveMetadataStatus:    row.post_archive_state.metadata_status,
      archiveHumanReviewStatus: row.post_archive_state.human_review_status,
      metrics: {
        available: metric !== null,
        likes:     metric?.likes    ?? null,
        comments:  metric?.comments ?? null,
        asOfDate:  metric?.date     ?? null,
      },
      score,
      reasons,
    }
  })

  // Sort: score desc, posted_at desc, id asc — deterministic across renders.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.postedAt !== b.postedAt) return a.postedAt < b.postedAt ? 1 : -1
    return a.postId < b.postId ? -1 : 1
  })

  // ----- Pagination over the scored pool -------------------------------
  const startIdx = (page - 1) * pageSize
  const items    = scored.slice(startIdx, startIdx + pageSize)

  const denom = gated.length || 1
  return {
    items,
    total:                scored.length,
    page,
    pageSize,
    windowed,
    candidateWindowLimit: ARCHIVE_REVIEW_CANDIDATE_WINDOW,
    kpis: {
      eligibleTotal,
      candidateWindow:      scored.length,
      candidateWindowLimit: ARCHIVE_REVIEW_CANDIDATE_WINDOW,
      captionPresentShare:  captionPresentCount / denom,
      withMetricsShare:     withMetricsCount    / denom,
    },
  }
}
