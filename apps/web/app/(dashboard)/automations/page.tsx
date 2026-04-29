import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getAutomationSummaries,
  listRecentWeeklySummaries,
} from '@/features/automations/queries'
import { AutomationStatusCard } from '@/components/automations/AutomationStatusCard'
import { WeeklySummaryCard } from '@/components/automations/WeeklySummaryCard'

// Editorial metadata for the canonical Sprint 8 automations.
// Keep in sync with CLAUDE.md table "AUTOMATIONS N8N À CRÉER".
const CANONICAL_META: Record<string, { description: string; note?: string }> = {
  'daily-instagram-sync': {
    description: 'CRON 06:00 UTC · ingestion Instagram Graph',
  },
  'weekly-creator-report': {
    description: 'CRON lundi 08:00 · génère weekly_summaries',
  },
  'papermark-open-alert': {
    description: 'Webhook Papermark · crée tâche de relance',
  },
  'followup-reminder': {
    description: 'CRON quotidien · tasks dues aujourd’hui',
  },
  'opportunity-stale-alert': {
    description: 'CRON quotidien · opportunities sans activité +7j',
  },
  'brand-watch-digest': {
    description: 'CRON vendredi 08:00 · digest veille marques',
  },
  'scoring-refresh': {
    description: 'CRON dimanche 06:00 · recalcul scores dbt',
    note: 'Triggers dbt run externally; hub only records the execution.',
  },
}

export default async function AutomationsPage() {
  const supabase = await createServerSupabaseClient()

  const [summaries, weekly] = await Promise.all([
    getAutomationSummaries(supabase),
    listRecentWeeklySummaries(supabase, 4),
  ])

  const canonical = summaries.filter((s) => s.canonical)
  const extras    = summaries.filter((s) => !s.canonical)

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Automations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only view of n8n workflows and scheduled reports. Scheduling and
          triggers are managed in n8n; the hub only observes.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Canonical automations
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {canonical.map((summary) => {
            const meta = CANONICAL_META[summary.name]
            return (
              <AutomationStatusCard
                key={summary.name}
                summary={summary}
                description={meta?.description}
                note={meta?.note}
              />
            )
          })}
        </div>
      </section>

      {extras.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Observed extras
          </h2>
          <p className="text-xs text-muted-foreground">
            Automations observed in <code>automation_runs</code> but outside the
            canonical Sprint 8 list.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {extras.map((summary) => (
              <AutomationStatusCard key={summary.name} summary={summary} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Weekly summaries
        </h2>
        <WeeklySummaryCard summaries={weekly} />
      </section>
    </div>
  )
}
