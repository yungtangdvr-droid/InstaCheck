import Link from 'next/link'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { KpiTile } from '@/components/ui/kpi-tile'
import { EmptyState } from '@/components/ui/empty-state'
import {
  COVERAGE_MEDIA_TYPES,
  COVERAGE_METRIC_KEYS,
  coveragePct,
  getArchiveCoverageReport,
  type CoverageCell,
  type CoverageMediaType,
  type CoverageMetricKey,
} from '@/lib/meta/queries/archive-coverage'

// Read-only monitoring surface for the archive backfill: tells the
// operator whether the imported sample is large enough per
// year × media_type to trust /content-lab/archive/review.

export const dynamic = 'force-dynamic'

const NF = new Intl.NumberFormat('fr-FR')
const PCT = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 0,
})

const MEDIA_TYPE_LABELS: Record<CoverageMediaType, string> = {
  IMAGE:          'Image',
  VIDEO:          'Vidéo',
  CAROUSEL_ALBUM: 'Carrousel',
}

const METRIC_LABELS: Record<CoverageMetricKey, string> = {
  likes:          'Likes',
  comments:       'Comments',
  saves:          'Saves',
  shares:         'Shares',
  profile_visits: 'Profile visits',
}

export default async function ArchiveCoveragePage() {
  const supabase = await createServerSupabaseClient()
  const report   = await getArchiveCoverageReport(supabase)

  const overallPct = coveragePct(report.overall)
  const hasData    = report.overall.postsTotal > 0

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Archive Pattern Library"
        title="Archive — couverture du backfill"
        description="Vue lecture seule de la complétude du backfill par année et format. Sert à savoir si l'archive est assez fournie pour fiabiliser la file de revue. Aucune action déclenchée par cette page."
        actions={
          <>
            <Link
              href="/content-lab/archive"
              className="text-xs font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-300"
            >
              ← État d'indexation
            </Link>
            <Link
              href="/content-lab/archive/review"
              className="text-xs font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-300"
            >
              File de revue →
            </Link>
          </>
        }
      />

      <section className="space-y-3">
        <SectionHeader
          title="Couverture globale"
          description="Posts importés (metadata_status = imported) et part de ces posts ayant au moins une ligne post_metrics_daily."
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <KpiTile
            label="Posts importés"
            value={NF.format(report.overall.postsTotal)}
            hint="Total imported (toutes années, tous formats)"
          />
          <KpiTile
            label="Avec métriques"
            value={NF.format(report.overall.postsWithMetrics)}
            hint="≥ 1 ligne post_metrics_daily"
          />
          <KpiTile
            label="Couverture metrics"
            value={PCT.format(overallPct)}
            hint="posts_with_metrics / posts_total"
          />
          <KpiTile
            label="Formats couverts"
            value={String(
              COVERAGE_MEDIA_TYPES.filter(
                (m) => report.byMedia[m].postsTotal > 0
              ).length
            )}
            hint={`/ ${COVERAGE_MEDIA_TYPES.length}`}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Couverture par format"
          description="Aperçu agrégé toutes années confondues. Permet de repérer un format sous-échantillonné par rapport aux autres."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {COVERAGE_MEDIA_TYPES.map((m) => {
            const cell = report.byMedia[m]
            return (
              <KpiTile
                key={m}
                label={MEDIA_TYPE_LABELS[m]}
                value={`${NF.format(cell.postsWithMetrics)} / ${NF.format(cell.postsTotal)}`}
                hint={
                  cell.postsTotal > 0
                    ? `${PCT.format(coveragePct(cell))} de couverture`
                    : 'Aucun post importé'
                }
              />
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Posts avec métrique > 0 (toutes années)"
          description="Proxy de captation : nombre de posts importés dont la dernière ligne post_metrics_daily a une valeur strictement positive pour la métrique. Les colonnes sont NOT NULL DEFAULT 0 dans le schéma, donc une vraie valeur 0 et une métrique non captée sont indistinguables — ce compteur n'est donc pas une mesure stricte de disponibilité de la métrique."
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {COVERAGE_METRIC_KEYS.map((k) => (
            <KpiTile
              key={k}
              label={METRIC_LABELS[k]}
              value={NF.format(report.overall.metricCounts[k])}
              hint={
                report.overall.postsTotal > 0
                  ? `${PCT.format(report.overall.metricCounts[k] / report.overall.postsTotal)} des importés`
                  : '—'
              }
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Couverture par année × format"
          description="Une ligne par année. Les chiffres présentés sont posts_with_metrics / posts_total, suivis du pourcentage. Les comptes par métrique (latest > 0) agrègent toutes les media_types de l'année et restent un proxy — voir section précédente."
        />
        {!hasData ? (
          <EmptyState
            title="Aucun post importé pour l'instant."
            description="La couverture se remplira au fil du backfill métadonnées."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Année</th>
                  <th className="px-3 py-2 font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Couv.</th>
                  {COVERAGE_MEDIA_TYPES.map((m) => (
                    <th key={m} className="px-3 py-2 font-medium">
                      {MEDIA_TYPE_LABELS[m]}
                    </th>
                  ))}
                  {COVERAGE_METRIC_KEYS.map((k) => (
                    <th key={k} className="px-3 py-2 font-medium">
                      {METRIC_LABELS[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.years.map((row) => (
                  <tr key={row.year} className="text-card-foreground">
                    <td className="px-3 py-2 font-medium tabular-nums">
                      {row.year}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {NF.format(row.total.postsWithMetrics)} /{' '}
                      {NF.format(row.total.postsTotal)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      <CoverageBadge cell={row.total} />
                    </td>
                    {COVERAGE_MEDIA_TYPES.map((m) => (
                      <td key={m} className="px-3 py-2 tabular-nums">
                        <CellSummary cell={row.byMedia[m]} />
                      </td>
                    ))}
                    {COVERAGE_METRIC_KEYS.map((k) => (
                      <td
                        key={k}
                        className="px-3 py-2 tabular-nums text-muted-foreground"
                      >
                        {NF.format(row.total.metricCounts[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function CellSummary({ cell }: { cell: CoverageCell }) {
  if (cell.postsTotal === 0) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <span>
      {NF.format(cell.postsWithMetrics)} / {NF.format(cell.postsTotal)}
    </span>
  )
}

function CoverageBadge({ cell }: { cell: CoverageCell }) {
  if (cell.postsTotal === 0) {
    return <span className="text-muted-foreground">—</span>
  }
  const pct = coveragePct(cell)
  const tone =
    pct >= 0.8
      ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300'
      : pct >= 0.4
        ? 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300'
        : 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300'
  return (
    <span
      className={
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ' +
        tone
      }
    >
      {PCT.format(pct)}
    </span>
  )
}

export const metadata = {
  title: 'Couverture archive — Creator Hub',
}
