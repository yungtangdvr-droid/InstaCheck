import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import {
  runArchiveMediaBackfill,
  DEFAULT_PAGE_BUDGET,
  DEFAULT_TIME_BUDGET_MS,
  MAX_PAGE_BUDGET,
  MAX_TIME_BUDGET_MS,
} from '@/lib/meta/archive-backfill'

// Bearer-authenticated archive backfill endpoint. Designed to be called
// either manually or by an n8n cron (see infrastructure/n8n/
// archive-backfill-cron.json). Reuses the same N8N_API_KEY env var as
// /api/meta/sync — no new env var.
//
// automation_runs status mapping:
//   - real work happened with no errors          → 'success'
//   - real work happened with errors / threw     → 'failed'
//   - already_running short-circuit              → 'skipped'
//   - terminal 'complete' short-circuit          → NOT logged (avoid
//                                                   cron tick spam)
//   - stale lock recovered                       → extra 'failed' entry
//                                                   logged before main entry

export const runtime = 'nodejs'
export const maxDuration = 120

const AUTOMATION_NAME = 'meta.archive.backfill'

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

  // Body and query-string both accepted. Query-string takes precedence
  // because it's the simpler smoke-test path: `…?pageBudget=1`.
  const url = new URL(request.url)
  let bodyPageBudget:   number | undefined
  let bodyTimeBudgetMs: number | undefined
  if (request.headers.get('content-type')?.includes('application/json')) {
    try {
      const body = (await request.json()) as { pageBudget?: number; timeBudgetMs?: number }
      bodyPageBudget   = body?.pageBudget
      bodyTimeBudgetMs = body?.timeBudgetMs
    } catch {
      // body is optional; ignore parse errors and fall back to query string
    }
  }

  const pageBudget   = parseNumber(url.searchParams.get('pageBudget'))   ?? bodyPageBudget   ?? DEFAULT_PAGE_BUDGET
  const timeBudgetMs = parseNumber(url.searchParams.get('timeBudgetMs')) ?? bodyTimeBudgetMs ?? DEFAULT_TIME_BUDGET_MS

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

  const supabase = createClient<Database>(supabaseUrl, supabaseKey)

  try {
    const result = await runArchiveMediaBackfill(
      { supabaseUrl, supabaseKey, igUserId, accessToken },
      { pageBudget, timeBudgetMs }
    )

    if (result.staleCleared) {
      await safeLog(supabase, 'failed', JSON.stringify({
        recovery: 'stale_lock_cleared',
        threshold: 'ran_at older than STALE_RUNNING_THRESHOLD_MS',
      }))
    }

    if (result.stoppedReason === 'already_running') {
      await safeLog(supabase, 'skipped', JSON.stringify({
        reason: 'already_running',
        cursor: result.cursor,
      }))
    } else if (
      result.stoppedReason === 'end_of_archive' &&
      !result.startedThisRun
    ) {
      // Terminal complete short-circuit. Do NOT log — scheduled ticks
      // would otherwise spam automation_runs forever.
    } else {
      await safeLog(
        supabase,
        result.errorThisRun ? 'failed' : 'success',
        JSON.stringify({
          pageBudget,
          timeBudgetMs,
          result,
        })
      )
    }

    return Response.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[POST /api/meta/archive/backfill]', message)
    await safeLog(supabase, 'failed', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

async function safeLog(
  supabase:       ReturnType<typeof createClient<Database>>,
  status:         Database['public']['Enums']['automation_status'],
  resultSummary:  string
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
