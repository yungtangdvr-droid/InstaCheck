import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

// Read-only helper that builds the Archive Prioritization Queue V1.1.
// Gating + filters + sort + pagination happen here. Scoring is deterministic
// (no AI, no embeddings) and runs server-side over the gated/filtered set.

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

export type ArchiveReviewMediaType = Database['public']['Enums']['media_type']

export const ARCHIVE_REVIEW_MEDIA_TYPES: ArchiveReviewMediaType[] = [
  'IMAGE',
  'VIDEO',
  'CAROUSEL_ALBUM',
]

export type ArchiveReviewCaptionFilter = 'all' | 'with' | 'without'
export type ArchiveReviewMetricsFilter = 'all' | 'with' | 'without'
export type ArchiveReviewSort =
  | 'priority'
  | 'date_desc'
  | 'date_asc'
  | 'metrics'

export type ArchiveReviewFilters = {
  year?:      number | null
  mediaType?: ArchiveReviewMediaType | null
  caption?:   ArchiveReviewCaptionFilter
  metrics?:   ArchiveReviewMetricsFilter
  sort?:      ArchiveReviewSort
}

export type ArchiveReviewItem = {
  postId:                   string
  mediaId:                  string
  mediaType:                ArchiveReviewMediaType
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
  eligibleTotal:           number
  filteredEligibleTotal:   number
  candidateWindow:         number
  candidateWindowLimit:    number
  resultCount:             number
  captionPresentShare:     number
  withMetricsShare:        number
}

export type ArchiveReviewFacets = {
  years:      number[]
  mediaTypes: ArchiveReviewMediaType[]
}

export type ArchiveReviewQueue = {
  items:                 ArchiveReviewItem[]
  total:                 number
  page:                  number
  pageSize:              number
  windowed:              boolean
  candidateWindowLimit:  number
  filtersApplied:        boolean
  kpis:                  ArchiveReviewKpis
  facets:                ArchiveReviewFacets
}

type Db = SupabaseClient<Database>

type GatedRow = {
  id:         string
  media_id:   string
  media_type: ArchiveReviewMediaType
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

function isoYearStart(year: number): string {
  return `${String(year).padStart(4, '0')}-01-01T00:00:00.000Z`
}

function isYearActive(filters: ArchiveReviewFilters): boolean {
  return typeof filters.year === 'number' && Number.isFinite(filters.year)
}

function hasReducingFilter(filters: ArchiveReviewFilters): boolean {
  if (isYearActive(filters)) return true
  if (filters.mediaType) return true
  if (filters.caption && filters.caption !== 'all') return true
  return false
}

// Apply the base gate + the SQL-pushable filters (year, mediaType, caption).
// Returns the same builder so callers can attach `.select`, `.order`, etc.
function applyGateAndSqlFilters<T>(
  builder: T,
  filters: ArchiveReviewFilters
): T {
  // The Supabase JS builder is fluent — calls return `this`. We type-erase
  // to keep the helper short; the final `select`/`order` calls re-establish
  // the proper return type.
  let b = builder as unknown as {
    eq:  (col: string, val: unknown) => typeof b
    gte: (col: string, val: unknown) => typeof b
    lt:  (col: string, val: unknown) => typeof b
    not: (col: string, op: string, val: unknown) => typeof b
    neq: (col: string, val: unknown) => typeof b
    or:  (cond: string) => typeof b
  }

  b = b
    .eq('post_archive_state.metadata_status',     'imported')
    .eq('post_archive_state.human_review_status', 'pending')

  if (isYearActive(filters)) {
    const y = filters.year as number
    b = b.gte('posted_at', isoYearStart(y)).lt('posted_at', isoYearStart(y + 1))
  }

  if (filters.mediaType) {
    b = b.eq('media_type', filters.mediaType)
  }

  if (filters.caption === 'with') {
    b = b.not('caption', 'is', null).neq('caption', '')
  } else if (filters.caption === 'without') {
    b = b.or('caption.is.null,caption.eq.')
  }

  return b as unknown as T
}

async function loadYearFacet(supabase: Db): Promise<number[]> {
  // Lightweight: read the earliest and latest posted_at of the *unfiltered*
  // gated pool, then expand to a year range. Two single-row queries — never
  // a full scan of the 28k archive.
  const oldestRes = await supabase
    .from('posts')
    .select('posted_at, post_archive_state!inner(metadata_status, human_review_status)')
    .eq('post_archive_state.metadata_status',     'imported')
    .eq('post_archive_state.human_review_status', 'pending')
    .order('posted_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (oldestRes.error) {
    throw new Error(`archive review oldest query failed: ${oldestRes.error.message}`)
  }

  const newestRes = await supabase
    .from('posts')
    .select('posted_at, post_archive_state!inner(metadata_status, human_review_status)')
    .eq('post_archive_state.metadata_status',     'imported')
    .eq('post_archive_state.human_review_status', 'pending')
    .order('posted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (newestRes.error) {
    throw new Error(`archive review newest query failed: ${newestRes.error.message}`)
  }

  const oldest = oldestRes.data?.posted_at ?? null
  const newest = newestRes.data?.posted_at ?? null
  if (!oldest || !newest) return []

  const yMin = new Date(oldest).getUTCFullYear()
  const yMax = new Date(newest).getUTCFullYear()
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax < yMin) return []

  const years: number[] = []
  for (let y = yMax; y >= yMin; y -= 1) years.push(y)
  return years
}

export async function getArchiveReviewQueue(
  supabase: Db,
  opts: {
    page?:     number
    pageSize?: number
  } & ArchiveReviewFilters = {}
): Promise<ArchiveReviewQueue> {
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? ARCHIVE_REVIEW_DEFAULT_PAGE_SIZE, 100))
  const page     = Math.max(1, opts.page ?? 1)

  const filters: ArchiveReviewFilters = {
    year:      opts.year      ?? null,
    mediaType: opts.mediaType ?? null,
    caption:   opts.caption   ?? 'all',
    metrics:   opts.metrics   ?? 'all',
    sort:      opts.sort      ?? 'priority',
  }
  const sort = filters.sort ?? 'priority'

  // ----- Eligible total (base gate, no filters) ------------------------
  const baseTotalRes = await supabase
    .from('posts')
    .select('id, post_archive_state!inner(metadata_status, human_review_status)', {
      head:  true,
      count: 'exact',
    })
    .eq('post_archive_state.metadata_status',     'imported')
    .eq('post_archive_state.human_review_status', 'pending')
  if (baseTotalRes.error) {
    throw new Error(`archive review total count failed: ${baseTotalRes.error.message}`)
  }
  const eligibleTotal = baseTotalRes.count ?? 0

  if (eligibleTotal === 0) {
    return {
      items:                [],
      total:                0,
      page:                 1,
      pageSize,
      windowed:             false,
      candidateWindowLimit: ARCHIVE_REVIEW_CANDIDATE_WINDOW,
      filtersApplied:       hasReducingFilter(filters) || filters.metrics !== 'all',
      kpis: {
        eligibleTotal:         0,
        filteredEligibleTotal: 0,
        candidateWindow:       0,
        candidateWindowLimit:  ARCHIVE_REVIEW_CANDIDATE_WINDOW,
        resultCount:           0,
        captionPresentShare:   0,
        withMetricsShare:      0,
      },
      facets: { years: [], mediaTypes: ARCHIVE_REVIEW_MEDIA_TYPES },
    }
  }

  // ----- Year facet (cheap, derived from oldest/newest) ----------------
  const years = await loadYearFacet(supabase)

  // ----- Filtered eligible count (only when an SQL filter is active) ---
  let filteredEligibleTotal = eligibleTotal
  if (hasReducingFilter(filters)) {
    let countQ = supabase
      .from('posts')
      .select('id, post_archive_state!inner(metadata_status, human_review_status)', {
        head:  true,
        count: 'exact',
      })
    countQ = applyGateAndSqlFilters(countQ, filters)
    const countRes = await countQ
    if (countRes.error) {
      throw new Error(`archive review filtered count failed: ${countRes.error.message}`)
    }
    filteredEligibleTotal = countRes.count ?? 0
  }

  // ----- Gated + filtered candidate pool -------------------------------
  let gatedQ = supabase
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
  gatedQ = applyGateAndSqlFilters(gatedQ, filters)

  const gatedRes = await gatedQ
    .order('posted_at', { ascending: false })
    .order('id',        { ascending: true })
    .limit(ARCHIVE_REVIEW_CANDIDATE_WINDOW)
  if (gatedRes.error) {
    throw new Error(`archive review gated query failed: ${gatedRes.error.message}`)
  }
  const gated = (gatedRes.data ?? []) as unknown as GatedRow[]
  const windowed = filteredEligibleTotal > gated.length

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

  let scored: ArchiveReviewItem[] = gated.map((row) => {
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

  // ----- In-memory metrics filter --------------------------------------
  if (filters.metrics === 'with') {
    scored = scored.filter((it) => it.metrics.available)
  } else if (filters.metrics === 'without') {
    scored = scored.filter((it) => !it.metrics.available)
  }

  // ----- Sort ----------------------------------------------------------
  if (sort === 'priority') {
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (a.postedAt !== b.postedAt) return a.postedAt < b.postedAt ? 1 : -1
      return a.postId < b.postId ? -1 : 1
    })
  } else if (sort === 'date_desc') {
    scored.sort((a, b) => {
      if (a.postedAt !== b.postedAt) return a.postedAt < b.postedAt ? 1 : -1
      return a.postId < b.postId ? -1 : 1
    })
  } else if (sort === 'date_asc') {
    scored.sort((a, b) => {
      if (a.postedAt !== b.postedAt) return a.postedAt < b.postedAt ? -1 : 1
      return a.postId < b.postId ? -1 : 1
    })
  } else {
    // sort === 'metrics' — engagement within available metrics
    scored.sort((a, b) => {
      const ea = (a.metrics.likes ?? 0) + (a.metrics.comments ?? 0)
      const eb = (b.metrics.likes ?? 0) + (b.metrics.comments ?? 0)
      if (eb !== ea) return eb - ea
      if (a.postedAt !== b.postedAt) return a.postedAt < b.postedAt ? 1 : -1
      return a.postId < b.postId ? -1 : 1
    })
  }

  // ----- Pagination over the scored pool -------------------------------
  const startIdx = (page - 1) * pageSize
  const items    = scored.slice(startIdx, startIdx + pageSize)

  const denom = gated.length || 1
  const filtersApplied = hasReducingFilter(filters) || filters.metrics !== 'all'

  return {
    items,
    total:                scored.length,
    page,
    pageSize,
    windowed,
    candidateWindowLimit: ARCHIVE_REVIEW_CANDIDATE_WINDOW,
    filtersApplied,
    kpis: {
      eligibleTotal,
      filteredEligibleTotal,
      candidateWindow:      gated.length,
      candidateWindowLimit: ARCHIVE_REVIEW_CANDIDATE_WINDOW,
      resultCount:          scored.length,
      captionPresentShare:  captionPresentCount / denom,
      withMetricsShare:     withMetricsCount    / denom,
    },
    facets: { years, mediaTypes: ARCHIVE_REVIEW_MEDIA_TYPES },
  }
}
