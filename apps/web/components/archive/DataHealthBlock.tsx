import { SectionHeader } from '@/components/ui/section-header'
import { KpiTile } from '@/components/ui/kpi-tile'
import {
  coveragePct,
  DATA_HEALTH_MEDIA_TYPES,
  type DataHealthMediaType,
  type DataHealthSnapshot,
} from '@/lib/meta/queries/data-health'
import type { ArchiveUiState } from '@/lib/meta/queries/archive-status'

const NF  = new Intl.NumberFormat('fr-FR')
const PCT = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 0,
})

const MEDIA_TYPE_LABELS: Record<DataHealthMediaType, string> = {
  IMAGE:          'Image',
  VIDEO:          'Vidéo',
  CAROUSEL_ALBUM: 'Carrousel',
}

const CURSOR_STATE_META: Record<
  ArchiveUiState,
  { label: string; className: string }
> = {
  idle:     { label: 'Idle',     className: 'bg-muted text-muted-foreground border-border' },
  running:  { label: 'Running',  className: 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300' },
  stale:    { label: 'Stale',    className: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300' },
  complete: { label: 'Complete', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300' },
  error:    { label: 'Error',    className: 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300' },
}

export function DataHealthBlock({ snapshot }: { snapshot: DataHealthSnapshot }) {
  const { archive, cursor, recent7dByMediaType, recent30d } = snapshot

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Data Health"
        description="Aperçu lecture seule de la complétude de l'archive Instagram et de la couverture des métriques récentes. Les pourcentages comparent les posts source à la présence d'au moins une ligne post_metrics_daily."
      />

      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Archive (totaux)
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            label="raw_instagram_media"
            value={NF.format(archive.rawMediaCount)}
            hint="Médias bruts Meta"
          />
          <KpiTile
            label="posts"
            value={NF.format(archive.postsCount)}
            hint="Posts indexés"
          />
          <KpiTile
            label="raw_instagram_media_insights"
            value={NF.format(archive.rawInsightsCount)}
            hint="Insights bruts Meta"
          />
          <KpiTile
            label="post_metrics_daily"
            value={NF.format(archive.postMetricsDailyCount)}
            hint="Lignes de métriques quotidiennes"
          />
        </div>
        <CursorLine cursor={cursor} />
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Couverture 7 j par format
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {DATA_HEALTH_MEDIA_TYPES.map((m) => {
            const cell = recent7dByMediaType[m]
            return (
              <KpiTile
                key={m}
                label={MEDIA_TYPE_LABELS[m]}
                value={
                  cell.postsTotal > 0
                    ? PCT.format(coveragePct(cell))
                    : '—'
                }
                hint={
                  cell.postsTotal > 0
                    ? `${NF.format(cell.postsWithMetrics)} / ${NF.format(cell.postsTotal)} avec métriques`
                    : 'Aucun post sur 7 j'
                }
              />
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Couverture 30 j (posts)
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiTile
            label="Posts (30 j)"
            value={NF.format(recent30d.postsTotal)}
            hint="posts.posted_at ≥ il y a 30 j"
          />
          <KpiTile
            label="Avec métriques (30 j)"
            value={NF.format(recent30d.postsWithMetrics)}
            hint="≥ 1 ligne post_metrics_daily"
          />
          <KpiTile
            label="Couverture (30 j)"
            value={
              recent30d.postsTotal > 0
                ? PCT.format(coveragePct(recent30d))
                : '—'
            }
            hint={
              recent30d.postsTotal > 0
                ? `${NF.format(recent30d.postsWithMetrics)} / ${NF.format(recent30d.postsTotal)}`
                : 'Aucun post sur 30 j'
            }
          />
        </div>
      </div>
    </section>
  )
}

function CursorLine({ cursor }: { cursor: DataHealthSnapshot['cursor'] }) {
  if (!cursor) {
    return (
      <p className="text-xs text-muted-foreground">
        Backfill archive : aucun run enregistré.
      </p>
    )
  }
  const meta = CURSOR_STATE_META[cursor.uiState]
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Backfill archive :</span>
      <span
        className={
          'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ' +
          meta.className
        }
      >
        {meta.label}
      </span>
      <span className="tabular-nums">
        {NF.format(cursor.upsertedCount)} upserted
        {cursor.finishedAt ? ` · terminé le ${formatDate(cursor.finishedAt)}` : ''}
      </span>
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

