import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import {
  runWindowedArchiveBackfill,
  DEFAULT_PAGE_BUDGET,
  DEFAULT_TIME_BUDGET_MS,
  DEFAULT_LIMIT,
  MAX_PAGE_BUDGET,
  MAX_TIME_BUDGET_MS,
  MAX_LIMIT,
} from '@/lib/meta/archive-backfill-windowed'

// Bearer-authenticated date-windowed archive backfill. Sibling of
// /api/meta/archive/backfill but uses `since` / `until` Meta params and
// per-window cursor rows (`meta.media.archive_backfill_windowed:<label>`)
// instead of one deep `after` cursor. Reuses N8N_API_KEY — no new env.
//
// Defaults are conservative: pageBudget=1 so manual smoke tests don't
// burn budget; n8n cron should pass an explicit pageBudget=3 once the
// endpoint has been validated.

export const runtime = 'nodejs'
export const maxDuration = 120

const AUTOMATION_NAME = 'meta.archive.backfill_windowed'
const WINDOW_PARAM_RE = /^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/

function parseNumber(raw: string | null | undefined): number | undefined {
  if (raw == null) return undefined
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : undefined
}

export async function POST(request: NextRequest) {
  const authHeader  = request.headers.get('authorization')
  const expectedKey = process.env.N8N_API_KEY
  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const igUserId    = process.env.META_INSTAGRAM_ACCOUNT_ID
  const accessToken = process.env.META_ACCESS_TOKEN
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!igUserId || !accessToken || !supabaseUrl || !supabaseKey) {
    return Response.json({ error: 'Missing env variables' }, { status: 500 })
  }

  // Query string takes precedence over body for the simpler smoke-test
  // path: `…?pageBudget=1&window=2022-03-01..2022-03-31`.
  const url = new URL(request.url)
  let bodyPageBudget:   number | undefined
  let bodyTimeBudgetMs: number | undefined
  let bodyLimit:        number | undefined
  let bodyWindow:       string | undefined
  if (request.headers.get('content-type')?.includes('application/json')) {
    try {
      const body = (await request.json()) as {
        pageBudget?:   number
        timeBudgetMs?: number
        limit?:        number
        window?:       string
      }
      bodyPageBudget   = body?.pageBudget
      bodyTimeBudgetMs = body?.timeBudgetMs
      bodyLimit        = body?.limit
      bodyWindow       = body?.window
    } catch {
      // body is optional; ignore parse errors and fall back to query string
    }
  }

  const pageBudget   = parseNumber(url.searchParams.get('pageBudget'))   ?? bodyPageBudget   ?? DEFAULT_PAGE_BUDGET
  const timeBudgetMs = parseNumber(url.searchParams.get('timeBudgetMs')) ?? bodyTimeBudgetMs ?? DEFAULT_TIME_BUDGET_MS
  const limit        = parseNumber(url.searchParams.get('limit'))        ?? bodyLimit        ?? DEFAULT_LIMIT
  const pinnedWindow = url.searchParams.get('window') ?? bodyWindow ?? undefined

  if (pageBudget < 1 || pageBudget > MAX_PAGE_BUDGET) {
    return Response.json(
      { error: `pageBudget must be between 1 and ${MAX_PAGE_BUDGET}` },
      { status: 400 }
    )
  }
  if (timeBudgetMs < 1_000 || timeBudgetMs > MAX_TIME_BUDGET_MS) {
    return Response.json(
      { error: `timeBudgetMs must be between 1000 and ${MAX_TIME_BUDGET_MS}` },
      { status: 400 }
    )
  }
  if (limit < 1 || limit > MAX_LIMIT) {
    return Response.json(
      { error: `limit must be between 1 and ${MAX_LIMIT}` },
      { status: 400 }
    )
  }
  if (pinnedWindow !== undefined && !WINDOW_PARAM_RE.test(pinnedWindow)) {
    return Response.json(
      { error: 'window must match YYYY-MM-DD..YYYY-MM-DD' },
      { status: 400 }
    )
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey)

  try {
    const result = await runWindowedArchiveBackfill(
      { supabaseUrl, supabaseKey, igUserId, accessToken },
      { pageBudget, timeBudgetMs, limit, pinnedWindow }
    )

    if (result.staleCleared) {
      await safeLog(supabase, 'failed', JSON.stringify({
        recovery:  'stale_lock_cleared',
        window:    result.selectedWindow,
        threshold: 'ran_at older than STALE_RUNNING_THRESHOLD_MS',
      }))
    }

    if (result.stoppedReason === 'already_running') {
      await safeLog(supabase, 'skipped', JSON.stringify({
        reason: 'already_running',
        window: result.selectedWindow,
        cursor: result.cursor,
      }))
    } else if (result.stoppedReason === 'manifest_exhausted') {
      // Terminal state for the manifest. Do NOT log — scheduled ticks
      // would otherwise spam automation_runs forever, mirroring the
      // legacy route's terminal-complete suppression.
    } else {
      await safeLog(
        supabase,
        result.errorThisRun ? 'failed' : 'success',
        JSON.stringify({
          pageBudget,
          timeBudgetMs,
          limit,
          result,
        })
      )
    }

    return Response.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[POST /api/meta/archive/backfill-windowed]', message)
    await safeLog(supabase, 'failed', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

async function safeLog(
  supabase:      ReturnType<typeof createClient<Database>>,
  status:        Database['public']['Enums']['automation_status'],
  resultSummary: string
): Promise<void> {
  try {
    await supabase.from('automation_runs').insert({
      automation_name: AUTOMATION_NAME,
      status,
      result_summary:  resultSummary,
    })
  } catch {
    // swallow logging failure — do not let the audit trail kill the run
  }
}
