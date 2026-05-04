import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

// Read-only loader for the archive backfill coverage page.
// Reads `v_archive_coverage_year_format` (migration 0016) and folds it
// into year × media_type cells plus per-year and overall totals.

type Db = SupabaseClient<Database>

export type CoverageMediaType = Database['public']['Enums']['media_type']

export const COVERAGE_MEDIA_TYPES: CoverageMediaType[] = [
  'IMAGE',
  'VIDEO',
  'CAROUSEL_ALBUM',
]

export type CoverageMetricKey =
  | 'likes'
  | 'comments'
  | 'saves'
  | 'shares'
  | 'profile_visits'

export const COVERAGE_METRIC_KEYS: CoverageMetricKey[] = [
  'likes',
  'comments',
  'saves',
  'shares',
  'profile_visits',
]

export type CoverageMetricCounts = Record<CoverageMetricKey, number>

export type CoverageCell = {
  postsTotal:        number
  postsWithMetrics:  number
  metricCounts:      CoverageMetricCounts
}

export type CoverageYearRow = {
  year:    number
  total:   CoverageCell
  byMedia: Record<CoverageMediaType, CoverageCell>
}

export type ArchiveCoverageReport = {
  years:     CoverageYearRow[]
  overall:   CoverageCell
  byMedia:   Record<CoverageMediaType, CoverageCell>
}

function emptyMetricCounts(): CoverageMetricCounts {
  return {
    likes:          0,
    comments:       0,
    saves:          0,
    shares:         0,
    profile_visits: 0,
  }
}

function emptyCell(): CoverageCell {
  return {
    postsTotal:       0,
    postsWithMetrics: 0,
    metricCounts:     emptyMetricCounts(),
  }
}

function emptyByMedia(): Record<CoverageMediaType, CoverageCell> {
  return {
    IMAGE:          emptyCell(),
    VIDEO:          emptyCell(),
    CAROUSEL_ALBUM: emptyCell(),
  }
}

function addInto(target: CoverageCell, source: CoverageCell): void {
  target.postsTotal       += source.postsTotal
  target.postsWithMetrics += source.postsWithMetrics
  for (const key of COVERAGE_METRIC_KEYS) {
    target.metricCounts[key] += source.metricCounts[key]
  }
}

export async function getArchiveCoverageReport(
  supabase: Db
): Promise<ArchiveCoverageReport> {
  const { data, error } = await supabase
    .from('v_archive_coverage_year_format')
    .select(
      'year, media_type, posts_total, posts_with_metrics, count_likes, count_comments, count_saves, count_shares, count_profile_visits'
    )

  if (error) {
    throw new Error(`v_archive_coverage_year_format select failed: ${error.message}`)
  }

  const yearMap = new Map<number, CoverageYearRow>()
  const overall = emptyCell()
  const byMedia = emptyByMedia()

  for (const row of data ?? []) {
    if (row.year === null || row.media_type === null) continue
    const mediaType = row.media_type as CoverageMediaType

    const cell: CoverageCell = {
      postsTotal:       row.posts_total       ?? 0,
      postsWithMetrics: row.posts_with_metrics ?? 0,
      metricCounts: {
        likes:          row.count_likes          ?? 0,
        comments:       row.count_comments       ?? 0,
        saves:          row.count_saves          ?? 0,
        shares:         row.count_shares         ?? 0,
        profile_visits: row.count_profile_visits ?? 0,
      },
    }

    let yearRow = yearMap.get(row.year)
    if (!yearRow) {
      yearRow = {
        year:    row.year,
        total:   emptyCell(),
        byMedia: emptyByMedia(),
      }
      yearMap.set(row.year, yearRow)
    }
    addInto(yearRow.byMedia[mediaType], cell)
    addInto(yearRow.total,              cell)
    addInto(byMedia[mediaType],         cell)
    addInto(overall,                    cell)
  }

  const years = Array.from(yearMap.values()).sort((a, b) => b.year - a.year)

  return { years, overall, byMedia }
}

export function coveragePct(cell: CoverageCell): number {
  if (cell.postsTotal === 0) return 0
  return cell.postsWithMetrics / cell.postsTotal
}
