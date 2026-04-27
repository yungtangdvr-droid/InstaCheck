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

const PROBE_CLI_HINT =
  'pnpm probe:benchmark -- --username=<handle> --persist --cohort=<core_peer|adjacent_culture|french_francophone|aspirational>'

export default async function BenchmarkPage() {
  const supabase = await createServerSupabaseClient()
  const overview = await getBenchmarkOverview(supabase)

  const accounts  = overview.accounts
  const latestRun = overview.latestRun
  const isEmpty   = accounts.length === 0 && latestRun === null

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs text-neutral-500">
            <Link href="/analytics" className="hover:text-neutral-300">
              Analytics
            </Link>
            <span>/</span>
            <span>Benchmark</span>
          </div>
          <h1 className="text-2xl font-semibold text-white">
            Benchmark — diagnostics
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Comptes benchmark sondés via l&apos;API Meta officielle (Business
            Discovery). Lecture seule — aucun score, aucun percentile, aucune
            sync planifiée.
          </p>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          {latestRun && <LatestRunCard run={latestRun} />}
          {accounts.length === 0 ? (
            <section className="rounded-lg border border-dashed border-neutral-800 bg-neutral-900/40 p-5">
              <p className="text-sm text-neutral-400">
                Aucun compte benchmark actif — un run a déjà été tenté mais aucun
                compte n&apos;est persisté.
              </p>
              <CliHint />
            </section>
          ) : (
            <AccountsTable rows={accounts} />
          )}
        </>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <section className="rounded-lg border border-dashed border-neutral-800 bg-neutral-900/40 p-6">
      <h2 className="text-sm font-medium text-neutral-300">
        Aucun compte benchmark persisté
      </h2>
      <p className="mt-2 text-sm text-neutral-400">
        Le pool benchmark est vide. La persistance se fait uniquement via la CLI
        locale, sur invocation manuelle (pas de sync planifiée).
      </p>
      <CliHint />
    </section>
  )
}

function CliHint() {
  return (
    <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-950 p-3">
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">
        Depuis apps/web
      </p>
      <code className="mt-2 block whitespace-pre-wrap break-all text-xs text-neutral-300">
        {PROBE_CLI_HINT}
      </code>
    </div>
  )
}

function LatestRunCard({ run }: { run: TBenchmarkLatestRun }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-neutral-300">Dernier run</h2>
          <p className="mt-1 text-[11px] text-neutral-500">
            Source : benchmark_sync_runs (kind={run.kind})
          </p>
        </div>
        <RunStatusBadge status={run.status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Démarré"
          value={formatDateTime(run.startedAt)}
        />
        <Stat
          label="Terminé"
          value={run.finishedAt ? formatDateTime(run.finishedAt) : 'En cours'}
        />
        <Stat
          label="Comptes"
          value={`${run.accountsSucceeded} / ${run.accountsAttempted}`}
          hint="succeeded / attempted"
        />
        <Stat
          label="Médias persistés"
          value={run.mediaFetched.toLocaleString('fr-FR')}
        />
      </div>

      {(run.notes || run.fetchedVia) && (
        <div className="mt-4 grid grid-cols-1 gap-1 text-[11px] text-neutral-500 sm:grid-cols-2">
          {run.fetchedVia && (
            <p>
              Source : <span className="text-neutral-300">{run.fetchedVia}</span>
            </p>
          )}
          {run.notes && (
            <p>
              Notes : <span className="text-neutral-300">{run.notes}</span>
            </p>
          )}
        </div>
      )}

      {run.errorCount > 0 && (
        <div className="mt-4 rounded-md border border-amber-900/40 bg-amber-950/20 p-3">
          <p className="text-xs font-medium text-amber-300">
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
    </section>
  )
}

function ErrorRow({ error }: { error: TBenchmarkRunErrorPreview }) {
  return (
    <li className="text-[11px] text-neutral-300">
      {error.where && (
        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
          {error.where}
        </span>
      )}
      {error.status !== null && (
        <span className="ml-1.5 text-amber-400">[{error.status}]</span>
      )}
      <span className="ml-1.5 text-neutral-300">{error.message}</span>
    </li>
  )
}

function RunStatusBadge({ status }: { status: string }) {
  const cls =
    status === 'success' ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300' :
    status === 'partial' ? 'border-amber-700/60 bg-amber-950/40 text-amber-300' :
    status === 'failed'  ? 'border-rose-700/60 bg-rose-950/40 text-rose-300' :
    status === 'running' ? 'border-sky-700/60 bg-sky-950/40 text-sky-300' :
                           'border-neutral-700 bg-neutral-900 text-neutral-300'

  return (
    <span
      className={`inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-medium ${cls}`}
    >
      {status}
    </span>
  )
}

function AccountsTable({ rows }: { rows: TBenchmarkAccountRow[] }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/60">
      <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
        <h2 className="text-sm font-medium text-neutral-300">
          Comptes benchmark ({rows.length})
        </h2>
        <p className="text-[11px] text-neutral-500">
          Moyennes média basées sur l&apos;échantillon Business Discovery (5 médias / run accumulés)
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-neutral-950/40 text-[11px] uppercase tracking-wider text-neutral-500">
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
    </section>
  )
}

function AccountRow({ row }: { row: TBenchmarkAccountRow }) {
  return (
    <tr className="border-t border-neutral-800/60 align-top">
      <td className="px-4 py-3">
        <p className="font-medium text-neutral-100">@{row.igUsername}</p>
        {row.language && (
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Langue : {row.language}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <CohortBadge cohort={row.cohort} />
      </td>
      <td className="px-4 py-3 tabular-nums text-neutral-200">
        {formatBigNumber(row.followersCount, row.followersAvailability)}
      </td>
      <td className="px-4 py-3 tabular-nums text-neutral-200">
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
      <td className="px-4 py-3 text-[11px] text-neutral-400">
        {row.latestSnapshotDate
          ? `Snapshot ${row.latestSnapshotDate}`
          : 'Pas de snapshot'}
        {row.latestSyncedAt && (
          <p className="text-neutral-600">
            Sync {formatDateTime(row.latestSyncedAt)}
          </p>
        )}
      </td>
    </tr>
  )
}

function CohortBadge({ cohort }: { cohort: TBenchmarkAccountRow['cohort'] }) {
  const cls =
    cohort === 'aspirational'       ? 'border-neutral-700 bg-neutral-900 text-neutral-400' :
    cohort === 'core_peer'          ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-300' :
    cohort === 'adjacent_culture'   ? 'border-sky-800/60 bg-sky-950/30 text-sky-300' :
                                      'border-violet-800/60 bg-violet-950/30 text-violet-300'

  return (
    <span
      className={`inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-medium ${cls}`}
      title={
        cohort === 'aspirational'
          ? 'Aspirationnel — exclu des calculs de percentile peer'
          : undefined
      }
    >
      {cohortLabelFr(cohort)}
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
        className="text-[11px] text-neutral-500"
        title={`metric_availability = ${availability}`}
      >
        Indispo
      </span>
    )
  }
  if (value === null) {
    return <span className="text-neutral-500">—</span>
  }
  return (
    <div>
      <p className="tabular-nums text-neutral-200">
        {Math.round(value).toLocaleString('fr-FR')}
      </p>
      <p className="text-[10px] text-neutral-500">
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
      <span
        className="inline-flex h-5 items-center rounded border border-neutral-700 bg-neutral-900 px-1.5 text-[10px] font-medium text-neutral-400"
        title={`metric_availability.reposts = ${availability}`}
      >
        Indispo
      </span>
    )
  }
  // Reposts is always persisted as null per benchmark doctrine, even when the
  // field is reported as available. Show an em dash to reflect that.
  return <span className="text-neutral-500">—</span>
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-neutral-600">{hint}</p>}
    </div>
  )
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
