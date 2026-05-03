import Link from 'next/link'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { KpiTile } from '@/components/ui/kpi-tile'
import {
  getArchiveStatusCounts,
  getArchiveCursor,
  type ArchiveUiState,
} from '@/lib/meta/queries/archive-status'

// Read-only surface for the Archive Pattern Library V1 backfill.
// Renders counters and the cursor row state. No buttons, no forms —
// the backfill is triggered manually via POST /api/meta/archive/backfill.

export const dynamic = 'force-dynamic'

const NF = new Intl.NumberFormat('fr-FR')

export default async function ArchiveStatusPage() {
  const supabase = await createServerSupabaseClient()

  const [counts, cursor] = await Promise.all([
    getArchiveStatusCounts(supabase),
    getArchiveCursor(supabase),
  ])

  const indexedShare =
    counts.postsTotal > 0
      ? Math.round((counts.archiveStateRows / counts.postsTotal) * 100)
      : 0

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Archive Pattern Library"
        title="Archive — état d'indexation"
        description="Vue lecture seule de l'avancement du backfill métadonnées (V1). Aucun appel d'insights, d'IA ni d'embeddings n'est déclenché par cette page."
        actions={
          <Link
            href="/content-lab/archive/review"
            className="text-xs font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-300"
          >
            File de revue →
          </Link>
        }
      />

      <section className="space-y-3">
        <SectionHeader
          title="Couverture métadonnées"
          description="Couverture des posts de l'archive Instagram dans la table d'état."
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            label="Posts (total)"
            value={NF.format(counts.postsTotal)}
            hint="Lignes dans posts"
          />
          <KpiTile
            label="Indexés"
            value={NF.format(counts.archiveStateRows)}
            hint="Lignes dans post_archive_state"
          />
          <KpiTile
            label="Métadonnées importées"
            value={NF.format(counts.metadataImported)}
            hint="metadata_status = imported"
          />
          <KpiTile
            label="Couverture"
            value={`${indexedShare}%`}
            hint="archive / posts"
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Axes de traitement (futur)"
          description="Aucun de ces axes n'est exécuté en V1. Les compteurs indiquent uniquement l'état par défaut."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiTile
            label="Métriques"
            value={NF.format(counts.metricsSynced)}
            hint={`synced · ${NF.format(counts.metricsQueued)} queued · ${NF.format(counts.metricsNotRequested)} not_requested`}
          />
          <KpiTile
            label="Embeddings"
            value={NF.format(counts.embeddingDone)}
            hint={`done · ${NF.format(counts.embeddingQueued)} queued · ${NF.format(counts.embeddingNotStarted)} not_started`}
          />
          <KpiTile
            label="AI tagging"
            value={NF.format(counts.aiTaggingTagged)}
            hint={`tagged · ${NF.format(counts.aiTaggingQueued)} queued · ${NF.format(counts.aiTaggingNotStarted)} not_started`}
          />
          <KpiTile
            label="Revue humaine"
            value={NF.format(counts.humanReviewApproved)}
            hint={`approved · ${NF.format(counts.humanReviewPending)} pending`}
          />
          <KpiTile
            label="Patterns liés"
            value={NF.format(counts.patternLinked)}
            hint={`linked · ${NF.format(counts.patternPending)} pending`}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Curseur d'ingestion"
          description="État du job meta.media.archive_backfill (table ingestion_cursors)."
        />
        {cursor ? (
          <div className="space-y-3">
            <UiStateBadge state={cursor.uiState} />
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-border">
                <CursorRow label="Job"                  value={cursor.jobName} />
                <CursorRow label="État (UI)"            value={cursor.uiState} />
                <CursorRow label="Statut (DB)"          value={cursor.status} />
                <CursorRow label="Curseur Meta (after)" value={cursor.cursor ?? '—'} mono />
                <CursorRow label="Dernier media_id"     value={cursor.lastProcessedMediaId ?? '—'} mono />
                <CursorRow label="Fetched (cumul.)"     value={NF.format(cursor.fetchedCount)} />
                <CursorRow label="Upserted (cumul.)"    value={NF.format(cursor.upsertedCount)} />
                <CursorRow label="Skipped (cumul.)"     value={NF.format(cursor.skippedCount)} />
                <CursorRow label="Errors (cumul.)"      value={NF.format(cursor.errorCount)} />
                <CursorRow label="Démarré le"           value={fmtDate(cursor.startedAt)} />
                <CursorRow label="Dernier run"          value={fmtDate(cursor.ranAt)} />
                <CursorRow label="Terminé le"           value={fmtDate(cursor.finishedAt)} />
                <CursorRow label="Dernière erreur"      value={cursor.lastError ?? '—'} />
              </tbody>
            </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun run encore enregistré. Déclenche le backfill via{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              POST /api/meta/archive/backfill
            </code>
            .
          </p>
        )}
      </section>
    </div>
  )
}

function CursorRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <tr>
      <th className="w-1/3 px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </th>
      <td
        className={
          'break-all px-4 py-2 text-card-foreground' +
          (mono ? ' font-mono text-xs' : '')
        }
      >
        {value}
      </td>
    </tr>
  )
}

const UI_STATE_META: Record<
  ArchiveUiState,
  { label: string; hint: string; className: string }
> = {
  idle: {
    label:     'Idle',
    hint:      'Prêt à démarrer au prochain tick scheduler.',
    className: 'bg-muted text-muted-foreground border border-border',
  },
  running: {
    label:     'Running',
    hint:      'Un run est en cours et a battu un heartbeat récemment.',
    className: 'bg-blue-500/10 text-blue-700 border border-blue-500/30 dark:text-blue-300',
  },
  stale: {
    label:     'Stale',
    hint:      'Marqué running mais sans heartbeat depuis > 5 min — sera libéré au prochain run.',
    className: 'bg-amber-500/10 text-amber-700 border border-amber-500/30 dark:text-amber-300',
  },
  complete: {
    label:     'Complete',
    hint:      'Backfill terminé. Les ticks scheduler suivants ne logguent plus rien.',
    className: 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 dark:text-emerald-300',
  },
  error: {
    label:     'Error',
    hint:      'Le dernier run a échoué. Le prochain tick re-prendra la suite.',
    className: 'bg-red-500/10 text-red-700 border border-red-500/30 dark:text-red-300',
  },
}

function UiStateBadge({ state }: { state: ArchiveUiState }) {
  const meta = UI_STATE_META[state]
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={
          'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ' +
          meta.className
        }
      >
        {meta.label}
      </span>
      <span className="text-sm text-muted-foreground">{meta.hint}</span>
    </div>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('fr-FR', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  })
}
