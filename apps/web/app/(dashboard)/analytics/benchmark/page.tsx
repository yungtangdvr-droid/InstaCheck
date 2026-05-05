import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  cohortLabelFr,
  getBenchmarkOverview,
  isUnavailableStatus,
  type TBenchmarkAccountRow,
  type TBenchmarkLatestRun,
  type TBenchmarkRunErrorPreview,
} from '@/features/benchmark/get-benchmark-overview'
import { PageHeader } from '@/components/ui/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { KpiTile } from '@/components/ui/kpi-tile'
import { VerdictBadge, type VerdictBadgeProps } from '@/components/ui/verdict-badge'
import { EmptyState } from '@/components/ui/empty-state'

const PROBE_CLI_HINT =
  'pnpm probe:benchmark -- --username=<handle> --persist --cohort=<core_peer|adjacent_culture|french_francophone|aspirational>'

export default async function BenchmarkPage() {
  const supabase = await createServerSupabaseClient()
  const overview = await getBenchmarkOverview(supabase)

  const accounts  = overview.accounts
  const latestRun = overview.latestRun
  const isEmpty   = accounts.length === 0 && latestRun === null

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Link href="/analytics" className="transition-colors hover:text-foreground">
              Analytics
            </Link>
            <span aria-hidden>/</span>
            <span>Benchmark</span>
          </span>
        }
        title="Benchmark — diagnostics"
        description="Comptes benchmark sondés via l'API Meta officielle (Business Discovery). Lecture seule — aucun score, aucun percentile, aucune sync planifiée."
        actions={<SyncBenchmarkAction />}
      />

      {isEmpty ? (
        <Card>
          <CardContent className="py-2">
            <EmptyState
              title="Aucun compte benchmark persisté"
              description="Le pool benchmark est vide. La persistance se fait uniquement via la CLI locale, sur invocation manuelle (pas de sync planifiée)."
            />
            <CliHint />
          </CardContent>
        </Card>
      ) : (
        <>
          {latestRun && <LatestRunCard run={latestRun} />}
          {accounts.length === 0 ? (
            <Card>
              <CardContent className="py-2">
                <EmptyState
                  title="Aucun compte benchmark actif"
                  description="Un run a déjà été tenté mais aucun compte n'est persisté."
                />
                <CliHint />
              </CardContent>
            </Card>
          ) : (
            <AccountsTable rows={accounts} />
          )}
        </>
      )}
    </div>
  )
}

// No HTTP/server-action benchmark sync exists in this codebase — the only
// supported entry point is the local `pnpm probe:benchmark` CLI script. This
// hotfix surfaces a visible-but-disabled action so the missing UI affordance
// is no longer invisible. Wiring an actual sync button needs its own scoped
// branch (a /api/benchmark/sync route + auth + rate limiting).
function SyncBenchmarkAction() {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title="Sync benchmark indisponible depuis l'UI — utilise la CLI : pnpm probe:benchmark -- --username=<handle> --persist --cohort=<cohorte>"
      className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-md border border-border bg-muted px-3 text-xs font-medium text-muted-foreground opacity-70"
    >
      <span aria-hidden>↻</span>
      Synchroniser benchmark
      <span className="ml-1 rounded bg-background px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
        CLI uniquement
      </span>
    </button>
  )
}

function CliHint() {
  return (
    <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Depuis apps/web
      </p>
      <code className="mt-2 block whitespace-pre-wrap break-all text-xs text-foreground">
        {PROBE_CLI_HINT}
      </code>
    </div>
  )
}

function LatestRunCard({ run }: { run: TBenchmarkLatestRun }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Dernier run</CardTitle>
            <CardDescription>
              Source : benchmark_sync_runs (kind={run.kind})
            </CardDescription>
          </div>
          <RunStatusBadge status={run.status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            label="Démarré"
            value={formatDateTime(run.startedAt)}
          />
          <KpiTile
            label="Terminé"
            value={run.finishedAt ? formatDateTime(run.finishedAt) : 'En cours'}
          />
          <KpiTile
            label="Comptes"
            value={`${run.accountsSucceeded} / ${run.accountsAttempted}`}
            hint="succeeded / attempted"
          />
          <KpiTile
            label="Médias persistés"
            value={run.mediaFetched.toLocaleString('fr-FR')}
          />
        </div>

        {(run.notes || run.fetchedVia) && (
          <div className="mt-4 grid grid-cols-1 gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
            {run.fetchedVia && (
              <p>
                Source : <span className="text-foreground">{run.fetchedVia}</span>
              </p>
            )}
            {run.notes && (
              <p>
                Notes : <span className="text-foreground">{run.notes}</span>
              </p>
            )}
          </div>
        )}

        {run.errorCount > 0 && (
          <div className="mt-4 rounded-md border border-warning/30 bg-warning-soft p-3">
            <p className="text-xs font-medium text-warning">
              {run.errorCount} erreur{run.errorCount > 1 ? 's' : ''} signalée{run.errorCount > 1 ? 's' : ''}
              {run.errors.length < run.errorCount &&
                ` (aperçu : ${run.errors.length})`}
            </p>
            <ul className="mt-2 space-y-1.5">
              {run.errors.map((e, idx) => (
                <ErrorRow key={idx} error={e} />
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ErrorRow({ error }: { error: TBenchmarkRunErrorPreview }) {
  return (
    <li className="text-[11px] text-foreground">
      {error.where && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {error.where}
        </span>
      )}
      {error.status !== null && (
        <span className="ml-1.5 text-warning">[{error.status}]</span>
      )}
      <span className="ml-1.5 text-foreground">{error.message}</span>
    </li>
  )
}

function RunStatusBadge({ status }: { status: string }) {
  const tone: NonNullable<VerdictBadgeProps['tone']> =
    status === 'success' ? 'success' :
    status === 'partial' ? 'warning' :
    status === 'failed'  ? 'danger'  :
    status === 'running' ? 'info'    :
                           'neutral'
  return (
    <VerdictBadge tone={tone} size="md">
      {status}
    </VerdictBadge>
  )
}

function AccountsTable({ rows }: { rows: TBenchmarkAccountRow[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <CardTitle>Comptes benchmark ({rows.length})</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Moyennes média basées sur l&apos;échantillon Business Discovery (5 médias / run accumulés)
          </p>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Compte</th>
                <th className="px-4 py-2 font-medium">Cohorte</th>
                <th className="px-4 py-2 font-medium">Followers</th>
                <th className="px-4 py-2 font-medium">Posts publiés</th>
                <th className="px-4 py-2 font-medium">Likes (avg)</th>
                <th className="px-4 py-2 font-medium">Comments (avg)</th>
                <th className="px-4 py-2 font-medium">Views (avg)</th>
                <th className="px-4 py-2 font-medium">Reposts</th>
                <th className="px-4 py-2 font-medium">Dernier sondage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <AccountRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function AccountRow({ row }: { row: TBenchmarkAccountRow }) {
  return (
    <tr className="border-t border-border align-top transition-colors hover:bg-muted/30">
      <td className="px-4 py-3">
        <p className="font-medium text-foreground">@{row.igUsername}</p>
        {row.language && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Langue : {row.language}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <CohortBadge cohort={row.cohort} />
      </td>
      <td className="px-4 py-3 tabular-nums text-foreground">
        {formatBigNumber(row.followersCount, row.followersAvailability)}
      </td>
      <td className="px-4 py-3 tabular-nums text-foreground">
        {formatBigNumber(row.mediaCount, row.mediaCountAvailability)}
      </td>
      <td className="px-4 py-3">
        <AverageCell
          value={row.likeAvg}
          availability={row.likeAvailability}
          sampleSize={row.mediaSampleSize}
        />
      </td>
      <td className="px-4 py-3">
        <AverageCell
          value={row.commentsAvg}
          availability={row.commentsAvailability}
          sampleSize={row.mediaSampleSize}
        />
      </td>
      <td className="px-4 py-3">
        <AverageCell
          value={row.viewAvg}
          availability={row.viewAvailability}
          sampleSize={row.mediaSampleSize}
        />
      </td>
      <td className="px-4 py-3">
        <RepostsCell availability={row.repostsAvailability} />
      </td>
      <td className="px-4 py-3 text-[11px] text-muted-foreground">
        <LastPollCell
          snapshotDate={row.latestSnapshotDate}
          syncedAt={row.latestSyncedAt}
        />
      </td>
    </tr>
  )
}

function CohortBadge({ cohort }: { cohort: TBenchmarkAccountRow['cohort'] }) {
  const tone: NonNullable<VerdictBadgeProps['tone']> =
    cohort === 'aspirational'     ? 'neutral' :
    cohort === 'core_peer'        ? 'success' :
    cohort === 'adjacent_culture' ? 'info'    :
                                    'info'

  const label = cohortLabelFr(cohort)
  // Tooltip carries the full label plus the aspirational caveat. The badge
  // itself is constrained with `whitespace-nowrap` + `max-w` so longer cohort
  // names ("Culture adjacente") cannot wrap or push the table layout.
  const title =
    cohort === 'aspirational'
      ? `${label} — exclu des calculs de percentile peer`
      : label

  return (
    <span title={title} aria-label={title}>
      <VerdictBadge tone={tone} className="whitespace-nowrap">
        {label}
      </VerdictBadge>
    </span>
  )
}

function AverageCell({
  value,
  availability,
  sampleSize,
}: {
  value:        number | null
  availability: TBenchmarkAccountRow['likeAvailability']
  sampleSize:   number
}) {
  if (isUnavailableStatus(availability)) {
    return (
      <span
        className="text-[11px] text-muted-foreground"
        title={`metric_availability = ${availability}`}
      >
        Indispo
      </span>
    )
  }
  if (value === null) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <div>
      <p className="tabular-nums text-foreground">
        {Math.round(value).toLocaleString('fr-FR')}
      </p>
      <p className="text-[10px] text-muted-foreground">
        n={sampleSize}
      </p>
    </div>
  )
}

function RepostsCell({
  availability,
}: {
  availability: TBenchmarkAccountRow['repostsAvailability']
}) {
  if (isUnavailableStatus(availability)) {
    return (
      <span title={`metric_availability.reposts = ${availability}`}>
        <VerdictBadge tone="neutral">Indispo</VerdictBadge>
      </span>
    )
  }
  // Reposts is always persisted as null per benchmark doctrine, even when the
  // field is reported as available. Show an em dash to reflect that.
  return <span className="text-muted-foreground">—</span>
}

function LastPollCell({
  snapshotDate,
  syncedAt,
}: {
  snapshotDate: string | null
  syncedAt:     string | null
}) {
  // Compact visible text, full detail in title. The previous layout rendered
  // "Snapshot YYYY-MM-DD" + "Sync DD/MM/YYYY HH:MM" on two uncontrolled lines,
  // which broke alignment and overflowed on narrow viewports.
  const visible = snapshotDate ?? (syncedAt ? formatShortDate(syncedAt) : '—')
  const titleParts = [
    snapshotDate ? `Snapshot ${snapshotDate}` : 'Pas de snapshot',
    syncedAt     ? `Sync ${formatDateTime(syncedAt)}` : null,
  ].filter(Boolean) as string[]
  const title = titleParts.join(' · ')
  return (
    <span
      title={title}
      aria-label={title}
      className="block whitespace-nowrap tabular-nums"
    >
      {visible}
    </span>
  )
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', {
    day:   '2-digit',
    month: '2-digit',
    year:  '2-digit',
  })
}

function formatBigNumber(
  value: number | null,
  availability: TBenchmarkAccountRow['followersAvailability'],
): string {
  if (isUnavailableStatus(availability)) return 'Indispo'
  if (value === null) return '—'
  return value.toLocaleString('fr-FR')
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('fr-FR', {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  })
}
