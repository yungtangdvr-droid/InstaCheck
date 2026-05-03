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

// Era-normalized index (Archive Review only) — bounded URL chunk size for
// the post_metrics_daily fetch. The candidate window plus the baseline
// universe can both reach 2 000 ids; a single `.in(post_id, [...])` call
// at that size produces a PostgREST URL that exceeds typical limits.
const METRICS_QUERY_CHUNK_SIZE = 200

// Minimum sample size for a (year, media_type) or (era, media_type)
// baseline cell to be considered usable for a per-metric ratio.
const ERA_MIN_SAMPLE = 5

// Display cap for the index. The index is unbounded in principle, but a
// few outliers can push the chip into 4 digits which destabilises the
// row layout. Capped at 250 = "≥ 2.5× comparable baseline".
const INDEX_DISPLAY_CAP = 250

// Reason chip threshold: post outperforms its comparable archive cell.
const ERA_OUTPERFORMER_THRESHOLD = 125

export type ArchiveReviewReason =
  | 'caption_present'
  | 'metrics_available'
  | 'recent_90d'
  | 'recent_365d'
  | 'representative_sample'
  | 'era_outperformer'

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
  | 'era_normalized'

// Coarse historical buckets for the archive. Used as a fallback baseline
// when same-year + same-format does not have ≥ ERA_MIN_SAMPLE posts. The
// exact cut-points are deliberately archive-specific and live here, not
// in `packages/scoring`, because they only describe how this account's
// engagement shape evolved over time.
export type TArchiveEra =
  | 'pre_2019'
  | '2019_2020'
  | '2021_2022'
  | '2023_2024'
  | '2025_plus'

export const ARCHIVE_ERAS: readonly TArchiveEra[] = [
  'pre_2019',
  '2019_2020',
  '2021_2022',
  '2023_2024',
  '2025_plus',
] as const

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
  score:               number
  reasons:             ArchiveReviewReason[]
  era:                 TArchiveEra | null
  eraNormalizedIndex:  number | null
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
  date:           string
  likes:          number | null
  comments:       number | null
  saves:          number | null
  shares:         number | null
  profile_visits: number | null
}

type MetricKey = 'saves' | 'shares' | 'comments' | 'likes' | 'profile_visits'

const METRIC_KEYS: readonly MetricKey[] = [
  'saves',
  'shares',
  'comments',
  'likes',
  'profile_visits',
] as const

// Default per-metric weights for the era-normalized index. Mirror the
// canonical `POST_SCORE_WEIGHTS` shape from `packages/scoring` but with
// `profile_visits` (snake_case) since that is the column name.
const DEFAULT_METRIC_WEIGHTS: Record<MetricKey, number> = {
  saves:          0.35,
  shares:         0.30,
  comments:       0.15,
  likes:          0.10,
  profile_visits: 0.10,
}

// Era-specific overrides — only declared where they meaningfully differ
// from the default. Pre-2019 leans on likes + comments because Instagram
// did not surface saves/shares/profile_visits reliably for this account.
// 2019-2020 partially credits saves/shares as exposure improved. 2021+
// keep the canonical weights.
const ERA_WEIGHT_OVERRIDES: Partial<Record<TArchiveEra, Partial<Record<MetricKey, number>>>> = {
  pre_2019: {
    likes:          0.40,
    comments:       0.45,
    saves:          0.10,
    shares:         0.05,
    profile_visits: 0.00,
  },
  '2019_2020': {
    likes:          0.25,
    comments:       0.20,
    saves:          0.30,
    shares:         0.20,
    profile_visits: 0.05,
  },
}

function eraOfYear(year: number): TArchiveEra {
  if (year <= 2018) return 'pre_2019'
  if (year <= 2020) return '2019_2020'
  if (year <= 2022) return '2021_2022'
  if (year <= 2024) return '2023_2024'
  return '2025_plus'
}

function yearOfIso(iso: string): number | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.getUTCFullYear()
}

function weightsForEra(era: TArchiveEra): Record<MetricKey, number> {
  const overrides = ERA_WEIGHT_OVERRIDES[era] ?? {}
  return { ...DEFAULT_METRIC_WEIGHTS, ...overrides }
}

type BaselineSlot = { sum: number; count: number }
type BaselineCell = Record<MetricKey, BaselineSlot>

function emptyBaselineCell(): BaselineCell {
  return {
    saves:          { sum: 0, count: 0 },
    shares:         { sum: 0, count: 0 },
    comments:       { sum: 0, count: 0 },
    likes:          { sum: 0, count: 0 },
    profile_visits: { sum: 0, count: 0 },
  }
}

type BaselineMaps = {
  // Keyed by `${year}__${media_type}` and `${era}__${media_type}`.
  yearFormat: Map<string, BaselineCell>
  eraFormat:  Map<string, BaselineCell>
}

function yearFormatKey(year: number, mt: ArchiveReviewMediaType): string {
  return `${year}__${mt}`
}

function eraFormatKey(era: TArchiveEra, mt: ArchiveReviewMediaType): string {
  return `${era}__${mt}`
}

function accumulateMetric(cell: BaselineCell, metric: LatestMetric): void {
  // Null = unknown → skip. Measured zero counts as a real zero.
  for (const k of METRIC_KEYS) {
    const v = metric[k]
    if (v === null || v === undefined) continue
    cell[k].sum   += v
    cell[k].count += 1
  }
}

function buildBaselines(
  rows: ReadonlyArray<GatedRow>,
  metrics: Map<string, LatestMetric>,
): BaselineMaps {
  const yearFormat = new Map<string, BaselineCell>()
  const eraFormat  = new Map<string, BaselineCell>()
  for (const r of rows) {
    const m = metrics.get(r.id)
    if (!m) continue
    const year = yearOfIso(r.posted_at)
    if (year === null) continue
    const era = eraOfYear(year)
    const yk = yearFormatKey(year, r.media_type)
    const ek = eraFormatKey(era,  r.media_type)
    let yc = yearFormat.get(yk)
    if (!yc) { yc = emptyBaselineCell(); yearFormat.set(yk, yc) }
    let ec = eraFormat.get(ek)
    if (!ec) { ec = emptyBaselineCell(); eraFormat.set(ek, ec) }
    accumulateMetric(yc, m)
    accumulateMetric(ec, m)
  }
  return { yearFormat, eraFormat }
}

// Per metric, prefer the same-year + same-format cell if its sample size
// is ≥ ERA_MIN_SAMPLE; otherwise fall back to same-era + same-format if
// IT has ≥ ERA_MIN_SAMPLE. Otherwise that metric is unusable for the
// post and is dropped (weights renormalize over the survivors).
function pickBaselineMeans(
  baselines: BaselineMaps,
  year: number,
  era:  TArchiveEra,
  mt:   ArchiveReviewMediaType,
): Partial<Record<MetricKey, number>> {
  const yc = baselines.yearFormat.get(yearFormatKey(year, mt))
  const ec = baselines.eraFormat.get(eraFormatKey(era, mt))
  const out: Partial<Record<MetricKey, number>> = {}
  for (const k of METRIC_KEYS) {
    const ys = yc?.[k]
    if (ys && ys.count >= ERA_MIN_SAMPLE && ys.sum > 0) {
      out[k] = ys.sum / ys.count
      continue
    }
    const es = ec?.[k]
    if (es && es.count >= ERA_MIN_SAMPLE && es.sum > 0) {
      out[k] = es.sum / es.count
    }
  }
  return out
}

function computeEraNormalizedIndex(
  metric: LatestMetric | null,
  era:    TArchiveEra,
  means:  Partial<Record<MetricKey, number>>,
): number | null {
  if (!metric) return null
  const weights = weightsForEra(era)

  let weightedRatioSum = 0
  let weightSum        = 0

  for (const k of METRIC_KEYS) {
    const value = metric[k]
    if (value === null || value === undefined) continue   // unknown → skip
    const w = weights[k]
    if (w <= 0) continue
    const mean = means[k]
    if (mean === undefined || mean <= 0) continue
    weightedRatioSum += w * (value / mean)
    weightSum        += w
  }

  if (weightSum === 0) return null
  const normalized = weightedRatioSum / weightSum  // 1.0 = at baseline
  const index = Math.round(normalized * 100)
  return Math.max(0, Math.min(INDEX_DISPLAY_CAP, index))
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

  // ----- Stable baseline universe --------------------------------------
  // Per archive-review v1.1 amendment: era-normalized baselines must NOT
  // shift when the user toggles year / mediaType / caption / metrics
  // filters. We re-fetch the candidate window with the base archive
  // gate only — except when the user has no reducing filters AND no
  // metrics filter, in which case `gated` already IS the unfiltered
  // window and we reuse it to save a round trip.
  const userHasAnyFilter =
    hasReducingFilter(filters) || (filters.metrics ?? 'all') !== 'all'

  let baselineUniverse: GatedRow[]
  if (userHasAnyFilter) {
    const baseRes = await supabase
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
    if (baseRes.error) {
      throw new Error(`archive review baseline universe query failed: ${baseRes.error.message}`)
    }
    baselineUniverse = (baseRes.data ?? []) as unknown as GatedRow[]
  } else {
    baselineUniverse = gated
  }

  // ----- Latest metrics per post (chunked, best-effort) ----------------
  // Fetch the latest snapshot for the union of (gated ∪ baselineUniverse).
  // PostgREST has practical URL limits, so we chunk the `.in(...)` call.
  const metricPostIdsSet = new Set<string>()
  for (const r of gated)            metricPostIdsSet.add(r.id)
  for (const r of baselineUniverse) metricPostIdsSet.add(r.id)
  const metricPostIds = Array.from(metricPostIdsSet)

  const latestMetrics = new Map<string, LatestMetric>()
  for (let i = 0; i < metricPostIds.length; i += METRICS_QUERY_CHUNK_SIZE) {
    const chunk = metricPostIds.slice(i, i + METRICS_QUERY_CHUNK_SIZE)
    const metricsRes = await supabase
      .from('post_metrics_daily')
      .select('post_id, date, likes, comments, saves, shares, profile_visits')
      .in('post_id', chunk)
      .order('date', { ascending: false })
    if (metricsRes.error) {
      throw new Error(`archive review metrics query failed: ${metricsRes.error.message}`)
    }
    for (const row of metricsRes.data ?? []) {
      // Rows are date-desc; first one wins per post_id.
      if (!latestMetrics.has(row.post_id)) {
        latestMetrics.set(row.post_id, {
          date:           row.date,
          likes:          row.likes          ?? null,
          comments:       row.comments       ?? null,
          saves:          row.saves          ?? null,
          shares:         row.shares         ?? null,
          profile_visits: row.profile_visits ?? null,
        })
      }
    }
  }

  // ----- Era-normalized baselines (built from baselineUniverse) --------
  const baselines = buildBaselines(baselineUniverse, latestMetrics)

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

    // Era-normalized index (additive to the existing priority score).
    const year = yearOfIso(row.posted_at)
    const era  = year !== null ? eraOfYear(year) : null
    let eraNormalizedIndex: number | null = null
    if (year !== null && era !== null) {
      const means = pickBaselineMeans(baselines, year, era, row.media_type)
      eraNormalizedIndex = computeEraNormalizedIndex(metric, era, means)
      if (eraNormalizedIndex !== null && eraNormalizedIndex >= ERA_OUTPERFORMER_THRESHOLD) {
        reasons.push('era_outperformer')
      }
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
      era,
      eraNormalizedIndex,
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
  } else if (sort === 'era_normalized') {
    // Era-normalized index, descending. Posts without a usable index
    // (no comparable baseline cell, or every weighted metric is
    // unavailable) fall to the bottom and there sort by date desc — we
    // don't drop them, so a null-metric post is still discoverable.
    scored.sort((a, b) => {
      const ai = a.eraNormalizedIndex
      const bi = b.eraNormalizedIndex
      if (ai === null && bi !== null) return 1
      if (ai !== null && bi === null) return -1
      if (ai !== null && bi !== null && ai !== bi) return bi - ai
      if (a.postedAt !== b.postedAt) return a.postedAt < b.postedAt ? 1 : -1
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
