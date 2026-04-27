import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase-extensions'
import {
  AUDIENCE_DEMOGRAPHICS_SENTINEL_KEY,
  type TAnalyticsPeriod,
  type TAudienceBreakdownState,
  type TAudienceDemographicBreakdown,
  type TAudienceDemographicsTimeframe,
  type TAudienceDemographicsView,
} from '@creator-hub/types'
import {
  baselineRatesForPost,
  computeDistributionScore,
  computeFormatRateMedians,
  type TDistributionSignal,
} from '@/features/analytics/engagement-score'
import { getAccountEngagementHealth } from '@/features/analytics/get-engagement-health'
import { isoDowToSundayFirst, FORMAT_LABEL } from '@/features/analytics/utils'

type Supabase = SupabaseClient<Database>

function periodFlagColumn(period: TAnalyticsPeriod): 'in_last_7d' | 'in_last_30d' | 'in_last_90d' {
  if (period === 7)  return 'in_last_7d'
  if (period === 30) return 'in_last_30d'
  return 'in_last_90d'
}

const DAY_NAMES_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

export type TAudienceTopPost = {
  postId:          string
  permalink:       string | null
  caption:         string | null
  mediaType:       string
  postedAt:        string | null
  reach:           number
  engagementScore: number
}

export type TAudienceFormatRate = {
  mediaType:  string
  postCount:  number
  totalReach: number
  savesRate:  number    // sum saves / sum reach
  sharesRate: number
}

export type TAudienceWindow = {
  dayOfWeek:   number   // 0–6 Sunday-first
  hour:        number   // 0–23
  savesAvg:    number
  postCount:   number
}

export type TAudienceData = {
  account: {
    username:    string | null
    instagramId: string | null
    avatarUrl:   string | null
  } | null
  followersCount:  number | null
  followersAt:     string | null
  postsAnalyzed:   number
  // v2 "Santé de circulation" — composite distribution health for the period.
  engagementScore: number
  engagementLabel: string
  dominantSignal:  TDistributionSignal | null
  interpretation:  string
  period:          TAnalyticsPeriod
  bestWindow:      TAudienceWindow | null
  formatsBySaves:  TAudienceFormatRate[]
  formatsByShares: TAudienceFormatRate[]
  topPosts:        TAudienceTopPost[]
  habitsSummary:   string
  demographics:    TAudienceDemographicsView
}

const DEMOGRAPHICS_TIMEFRAME: TAudienceDemographicsTimeframe = 'last_30_days'
const DEMOGRAPHICS_BREAKDOWNS: ReadonlyArray<TAudienceDemographicBreakdown> = [
  'country', 'city', 'age', 'gender',
]

/**
 * Read-only aggregation feeding /audience. Pure on top of existing tables —
 * no demographics are inferred from post content. Audience demographics
 * (gender / age / country / city) require the Meta `follower_demographics`
 * insight which the current sync does not request, so the page renders an
 * honest empty state for that section.
 */
export async function getAudienceData(
  supabase: Supabase,
  period: TAnalyticsPeriod,
): Promise<TAudienceData> {
  const flag = periodFlagColumn(period)

  const [
    accountRes,
    followersRes,
    postsRes,
    windowsRes,
    engagement,
    demographicsRes,
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select('username, instagram_id, avatar_url')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('raw_instagram_account_daily')
      .select('followers_count, date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('v_mart_post_performance')
      .select('post_id, media_type, caption, permalink, posted_at, total_reach, total_saves, total_shares, total_comments, total_likes, total_profile_visits, baseline_saves, baseline_shares, baseline_comments, baseline_likes, baseline_profile_visits')
      .eq(flag, true),
    supabase
      .from('v_mart_best_posting_windows')
      .select('day_of_week, hour, avg_saves, post_count, low_sample_flag, media_type')
      .eq('period_days', period)
      .is('media_type', null),
    getAccountEngagementHealth(supabase, period),
    supabase
      .from('raw_instagram_audience_demographics')
      .select('breakdown, key, label, value, threshold_state, reason, date, synced_at')
      .eq('timeframe', DEMOGRAPHICS_TIMEFRAME)
      .order('date', { ascending: false }),
  ])

  const posts = postsRes.data ?? []

  // Per-format reach-rates (saves & shares). Only format slices with at least
  // one post AND non-zero reach contribute.
  const byFormat = new Map<string, { count: number; reach: number; saves: number; shares: number }>()
  for (const p of posts) {
    const mt = p.media_type ?? 'UNKNOWN'
    const acc = byFormat.get(mt) ?? { count: 0, reach: 0, saves: 0, shares: 0 }
    acc.count  += 1
    acc.reach  += Number(p.total_reach  ?? 0)
    acc.saves  += Number(p.total_saves  ?? 0)
    acc.shares += Number(p.total_shares ?? 0)
    byFormat.set(mt, acc)
  }
  const formatRates: TAudienceFormatRate[] = Array.from(byFormat.entries())
    .map(([mediaType, v]) => ({
      mediaType,
      postCount:  v.count,
      totalReach: v.reach,
      savesRate:  v.reach > 0 ? v.saves  / v.reach : 0,
      sharesRate: v.reach > 0 ? v.shares / v.reach : 0,
    }))
    .filter(f => f.totalReach > 0)

  const formatsBySaves  = formatRates.slice().sort((a, b) => b.savesRate  - a.savesRate)
  const formatsByShares = formatRates.slice().sort((a, b) => b.sharesRate - a.sharesRate)

  // Top engaging posts (top 3 by v2 distribution score within the period).
  // Uses the same per-format median fallback as analytics so the audience
  // ranking aligns with PostExplorer.
  const formatRateMedians = computeFormatRateMedians(posts)
  const ranked: TAudienceTopPost[] = posts
    .map(p => {
      const reach    = Number(p.total_reach    ?? 0)
      const saves    = Number(p.total_saves    ?? 0)
      const shares   = Number(p.total_shares   ?? 0)
      const comments = Number(p.total_comments ?? 0)
      const likes    = Number(p.total_likes    ?? 0)
      const pv       = p.total_profile_visits == null ? null : Number(p.total_profile_visits)
      const eng = computeDistributionScore({
        reach,
        shares,
        saves,
        comments,
        likes,
        profileVisits:  pv,
        baselineRates:  baselineRatesForPost(p, formatRateMedians),
      })
      return {
        postId:          p.post_id   ?? '',
        permalink:       p.permalink ?? null,
        caption:         p.caption   ?? null,
        mediaType:       p.media_type ?? 'UNKNOWN',
        postedAt:        p.posted_at ?? null,
        reach,
        engagementScore: eng.score,
      }
    })
    .sort((a, b) => b.engagementScore - a.engagementScore)
    .slice(0, 3)

  // Best window — top avg_saves cell from the all-formats rollup, ignoring
  // tiny low-sample cells unless nothing else is available.
  const windowRows = windowsRes.data ?? []
  const validWindows = windowRows.filter(w => !w.low_sample_flag)
  const pickedRow = (validWindows.length > 0 ? validWindows : windowRows)
    .slice()
    .sort((a, b) => Number(b.avg_saves ?? 0) - Number(a.avg_saves ?? 0))[0] ?? null

  const bestWindow: TAudienceWindow | null = pickedRow
    ? {
        dayOfWeek: isoDowToSundayFirst(pickedRow.day_of_week ?? 1),
        hour:      pickedRow.hour ?? 0,
        savesAvg:  Number(pickedRow.avg_saves  ?? 0),
        postCount: Number(pickedRow.post_count ?? 0),
      }
    : null

  // Habits summary — built from the dominant circulation signal + best window +
  // best saves format. No demographic inference; only what's measurable.
  const habitsSummary = buildHabitsSummary({
    dominantSignal:  engagement.current.dominantSignal,
    bestWindow,
    bestSavesFormat: formatsBySaves[0] ?? null,
    hasReach:        engagement.current.hasReach,
  })

  const demographics = buildDemographicsView(demographicsRes.data ?? [])

  return {
    account: accountRes.data
      ? {
          username:    accountRes.data.username    ?? null,
          instagramId: accountRes.data.instagram_id ?? null,
          avatarUrl:   accountRes.data.avatar_url  ?? null,
        }
      : null,
    followersCount:  followersRes.data?.followers_count ?? null,
    followersAt:     followersRes.data?.date            ?? null,
    postsAnalyzed:   posts.length,
    engagementScore: engagement.current.score,
    engagementLabel: engagement.current.label,
    dominantSignal:  engagement.current.dominantSignal,
    interpretation:  engagement.interpretation,
    period,
    bestWindow,
    formatsBySaves,
    formatsByShares,
    topPosts:        ranked,
    habitsSummary,
    demographics,
  }
}

type DemographicsRow = {
  breakdown:       string
  key:             string
  label:           string | null
  value:           number
  threshold_state: string
  reason:          string | null
  date:            string
  synced_at:       string
}

// Group rows by breakdown, keep only the latest snapshot date per
// breakdown, and project to a TAudienceBreakdownState. Rows are
// pre-sorted desc by date — we read the first date we see per
// breakdown and keep all rows with that date.
function buildDemographicsView(rows: DemographicsRow[]): TAudienceDemographicsView {
  const view: TAudienceDemographicsView = {
    timeframe: DEMOGRAPHICS_TIMEFRAME,
    syncedAt:  null,
    country: { state: 'not_synced' },
    city:    { state: 'not_synced' },
    age:     { state: 'not_synced' },
    gender:  { state: 'not_synced' },
  }

  let latestSyncedAt: string | null = null
  const grouped: Record<TAudienceDemographicBreakdown, DemographicsRow[]> = {
    country: [], city: [], age: [], gender: [],
  }
  const latestDate: Partial<Record<TAudienceDemographicBreakdown, string>> = {}

  for (const r of rows) {
    if (!isBreakdown(r.breakdown)) continue
    const seen = latestDate[r.breakdown]
    if (seen === undefined) {
      latestDate[r.breakdown] = r.date
    } else if (r.date !== seen) {
      // Older snapshot — skip.
      continue
    }
    grouped[r.breakdown].push(r)
    if (latestSyncedAt === null || r.synced_at > latestSyncedAt) {
      latestSyncedAt = r.synced_at
    }
  }

  view.syncedAt = latestSyncedAt

  for (const breakdown of DEMOGRAPHICS_BREAKDOWNS) {
    view[breakdown] = projectBreakdown(grouped[breakdown])
  }

  return view
}

function isBreakdown(s: string): s is TAudienceDemographicBreakdown {
  return s === 'country' || s === 'city' || s === 'age' || s === 'gender'
}

function projectBreakdown(rows: DemographicsRow[]): TAudienceBreakdownState {
  if (rows.length === 0) return { state: 'not_synced' }

  // Single-row sentinel cases.
  const sentinel = rows.find(r => r.key === AUDIENCE_DEMOGRAPHICS_SENTINEL_KEY)
  if (sentinel && rows.length === 1) {
    if (sentinel.threshold_state === 'available_below_threshold') {
      return {
        state:  'available_below_threshold',
        reason: sentinel.reason ?? 'Sous le seuil Meta pour cet axe.',
      }
    }
    if (sentinel.threshold_state === 'unavailable') {
      return {
        state:  'unavailable',
        reason: sentinel.reason ?? 'Indisponible côté Meta.',
      }
    }
  }

  const realRows = rows
    .filter(r => r.key !== AUDIENCE_DEMOGRAPHICS_SENTINEL_KEY && r.threshold_state === 'available')
    .map(r => ({ key: r.key, label: r.label, value: Number(r.value) || 0 }))
    .filter(r => r.value > 0)

  if (realRows.length === 0) {
    return {
      state:  'available_below_threshold',
      reason: sentinel?.reason ?? 'Réponse Meta sans valeur exploitable pour cet axe.',
    }
  }

  const sum = realRows.reduce((a, r) => a + r.value, 0)
  const projected = realRows
    .map(r => ({
      key:   r.key,
      label: r.label,
      value: r.value,
      share: sum > 0 ? r.value / sum : 0,
    }))
    .sort((a, b) => b.value - a.value)

  return { state: 'available', rows: projected }
}

function buildHabitsSummary(input: {
  dominantSignal:  TDistributionSignal | null
  bestWindow:      TAudienceWindow | null
  bestSavesFormat: TAudienceFormatRate | null
  hasReach:        boolean
}): string {
  if (!input.hasReach) {
    return 'Pas encore assez de reach pour décrire les habitudes de ton audience.'
  }

  const parts: string[] = []

  if (input.bestSavesFormat) {
    const fmt = FORMAT_LABEL[input.bestSavesFormat.mediaType] ?? input.bestSavesFormat.mediaType
    if (input.dominantSignal === 'saves') {
      parts.push(`Ton audience sauvegarde surtout les ${fmt.toLowerCase()}s`)
    } else if (input.dominantSignal === 'shares') {
      parts.push(`Ton audience partage activement, avec un appui sur les ${fmt.toLowerCase()}s`)
    } else if (input.dominantSignal === 'comments') {
      parts.push(`Ton audience commente, avec un appui sur les ${fmt.toLowerCase()}s`)
    } else if (input.dominantSignal === 'profileVisits') {
      parts.push(`Tes posts génèrent des visites de profil, surtout sur les ${fmt.toLowerCase()}s`)
    } else {
      parts.push(`Ton audience réagit surtout aux ${fmt.toLowerCase()}s`)
    }
  } else if (input.dominantSignal === 'saves') {
    parts.push('Ton audience sauvegarde plus qu\'elle ne réagit en surface')
  } else if (input.dominantSignal === 'shares') {
    parts.push('Ton audience partage tes posts plus que la moyenne')
  } else if (input.dominantSignal === 'profileVisits') {
    parts.push('Tes posts génèrent des visites de profil')
  } else {
    parts.push('Ton audience interagit modérément')
  }

  if (input.bestWindow) {
    const day  = DAY_NAMES_FR[input.bestWindow.dayOfWeek] ?? '—'
    const hour = String(input.bestWindow.hour).padStart(2, '0')
    parts.push(`avec un pic d'interaction autour de ${day} ${hour}h`)
  }

  return parts.join(' ') + '.'
}
