import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { TAnalyticsPeriod } from '@creator-hub/types'
import { isPendingForCurrentVersion } from '@/lib/content-analysis/eligibility'

type Supabase = SupabaseClient<Database>

// Shape of `automation_runs.result_summary` written by /api/meta/sync on
// success. Other automations write strings or other shapes — parsing is
// defensive and returns null when the stored value isn't this JSON.
type TSyncSummary = {
  account?: {
    accountId?:    string
    username?:     string
    insertedRows?: number
  }
  media?: {
    total?:     number
    limit?:     number
    created?:   number
    updated?:   number
    processed?: number
  }
  insights?: { count?: number }
  errors?:   string[]
  durationMs?: number
}

export type TDataHealth = {
  account: {
    username:     string | null
    instagramId:  string | null
    avatarUrl:    string | null
  } | null
  lastSync: {
    at:      string | null
    status:  string | null
    summary: TSyncSummary | null
    errorMessage: string | null
  }
  totalPosts:                   number
  periodPosts:                  number
  postsWithMetrics:             number
  rawMediaCount:                number
  rawInsightsCount:             number
  martRowCount:                 number
  mediaSyncLimit:               number | null
  postsPendingContentAnalysis:  number
}

function periodFlagColumn(period: TAnalyticsPeriod): 'in_last_7d' | 'in_last_30d' | 'in_last_90d' {
  if (period === 7)  return 'in_last_7d'
  if (period === 30) return 'in_last_30d'
  return 'in_last_90d'
}

function parseSummary(raw: string | null): { summary: TSyncSummary | null; errorMessage: string | null } {
  if (!raw) return { summary: null, errorMessage: null }
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) {
    // Failure path stores the exception message verbatim.
    return { summary: null, errorMessage: trimmed }
  }
  try {
    return { summary: JSON.parse(trimmed) as TSyncSummary, errorMessage: null }
  } catch {
    return { summary: null, errorMessage: trimmed }
  }
}

/**
 * Read-only snapshot of ingestion + mart health, for the Analytics header.
 * Single-tenant: `accounts` has at most one row and we surface it as the
 * connected operator. Every count uses `head: true` so no rows are shipped
 * over the wire — the only full-row fetch is the latest sync run.
 *
 * `postsWithMetrics` leans on the v_mart_post_performance row being gated
 * on at least one post_metrics_daily aggregate, so a count of rows where
 * total_reach + total_saves + total_shares > 0 approximates "posts Meta
 * actually returned insights for".
 */
export async function getDataHealth(
  supabase: Supabase,
  period: TAnalyticsPeriod,
): Promise<TDataHealth> {
  const periodFlag = periodFlagColumn(period)

  const [
    accountRes,
    syncRes,
    totalPostsRes,
    periodPostsRes,
    postsWithMetricsRes,
    rawMediaRes,
    rawInsightsRes,
    martRes,
    pendingMartRes,
    pendingAnalyzedRes,
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select('username, instagram_id, avatar_url')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('automation_runs')
      .select('ran_at, status, result_summary')
      .eq('automation_name', 'daily-instagram-sync')
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('posts')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('v_mart_post_performance')
      .select('post_id', { count: 'exact', head: true })
      .eq(periodFlag, true),
    supabase
      .from('v_mart_post_performance')
      .select('post_id', { count: 'exact', head: true })
      .gt('total_reach', 0),
    supabase
      .from('raw_instagram_media')
      .select('media_id', { count: 'exact', head: true }),
    supabase
      .from('raw_instagram_media_insights')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('v_mart_post_performance')
      .select('post_id', { count: 'exact', head: true }),
    // Pending analysis count: same window as the analyze-new flow (last 90d
    // of v_mart_post_performance, which is what pickCandidates scans). The
    // pending rule is shared with the candidate picker — a post is pending
    // unless it already has status='completed' for the current PROMPT_VERSION.
    supabase
      .from('v_mart_post_performance')
      .select('post_id')
      .eq('in_last_90d', true),
    supabase
      .from('post_content_analysis')
      .select('post_id, status, prompt_version'),
  ])

  const { summary, errorMessage } = parseSummary(syncRes.data?.result_summary ?? null)

  const analyzedByPost = new Map<string, { status: string | null; prompt_version: string | null }>()
  for (const row of pendingAnalyzedRes.data ?? []) {
    if (typeof row.post_id === 'string') {
      analyzedByPost.set(row.post_id, {
        status:         row.status         ?? null,
        prompt_version: row.prompt_version ?? null,
      })
    }
  }
  const postsPendingContentAnalysis =
    (pendingMartRes.data ?? []).filter(
      (r) =>
        typeof r.post_id === 'string' &&
        isPendingForCurrentVersion(analyzedByPost.get(r.post_id)),
    ).length

  return {
    account: accountRes.data
      ? {
          username:    accountRes.data.username,
          instagramId: accountRes.data.instagram_id,
          avatarUrl:   accountRes.data.avatar_url,
        }
      : null,
    lastSync: {
      at:           syncRes.data?.ran_at ?? null,
      status:       syncRes.data?.status ?? null,
      summary,
      errorMessage,
    },
    totalPosts:                   totalPostsRes.count       ?? 0,
    periodPosts:                  periodPostsRes.count      ?? 0,
    postsWithMetrics:             postsWithMetricsRes.count ?? 0,
    rawMediaCount:                rawMediaRes.count         ?? 0,
    rawInsightsCount:             rawInsightsRes.count      ?? 0,
    martRowCount:                 martRes.count             ?? 0,
    mediaSyncLimit:               summary?.media?.limit     ?? null,
    postsPendingContentAnalysis,
  }
}
