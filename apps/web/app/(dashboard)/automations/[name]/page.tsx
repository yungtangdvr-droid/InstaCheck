import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getAutomationSummaries,
  listRecentWeeklySummaries,
  listRuns,
} from '@/features/automations/queries'
import { RunHistory } from '@/components/automations/RunHistory'
import { WeeklySummaryCard } from '@/components/automations/WeeklySummaryCard'
import { formatRelative } from '@/features/automations/utils'

export default async function AutomationHistoryPage({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const { name: rawName } = await params
  const name = decodeURIComponent(rawName)

  const supabase = await createServerSupabaseClient()

  const [summaries, runs] = await Promise.all([
    getAutomationSummaries(supabase),
    listRuns(supabase, name, 50),
  ])

  const summary = summaries.find((s) => s.name === name)
  if (!summary && runs.length === 0) notFound()

  const showWeeklySummaries = name === 'weekly-creator-report'
  const weekly = showWeeklySummaries ? await listRecentWeeklySummaries(supabase, 4) : []

  const runs7d = summary?.runs7d ?? { success: 0, failed: 0, skipped: 0 }
  const lastRunAt = summary?.lastRun?.ranAt ?? null

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/automations"
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          ← Automations
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">{name}</h1>
        <p className="mt-1 text-sm text-neutral-400">
          last run · {formatRelative(lastRunAt)} · 7d · {runs7d.success}✓ {runs7d.failed}✗ {runs7d.skipped}⏭
        </p>
        {summary && !summary.canonical && (
          <p className="mt-1 text-xs text-neutral-500">
            Observed extra · not in the canonical Sprint 8 automation set.
          </p>
        )}
      </div>

      {showWeeklySummaries && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Recent weekly summaries
          </h2>
          <WeeklySummaryCard summaries={weekly} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Run history · last 50
        </h2>
        <RunHistory runs={runs} expandedCount={5} />
      </section>
    </div>
  )
}
