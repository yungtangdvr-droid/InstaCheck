import Link from 'next/link'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { KpiTile } from '@/components/ui/kpi-tile'
import { EmptyState } from '@/components/ui/empty-state'
import { ArchiveReviewRow } from '@/features/content-lab/ArchiveReviewRow'
import {
  ArchiveReviewFilters,
  buildArchiveReviewHref,
  type ArchiveReviewFiltersState,
} from '@/features/content-lab/ArchiveReviewFilters'
import {
  ARCHIVE_REVIEW_MEDIA_TYPES,
  getArchiveReviewQueue,
  type ArchiveReviewCaptionFilter,
  type ArchiveReviewMediaType,
  type ArchiveReviewMetricsFilter,
  type ArchiveReviewSort,
} from '@/lib/meta/queries/archive-review-queue'

export const dynamic = 'force-dynamic'

const BASE_PATH = '/content-lab/archive/review'

const NF = new Intl.NumberFormat('fr-FR')
const PCT = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 0,
})

const MEDIA_TYPES_SET = new Set<ArchiveReviewMediaType>(ARCHIVE_REVIEW_MEDIA_TYPES)
const CAPTION_VALUES: ReadonlyArray<ArchiveReviewCaptionFilter> = ['all', 'with', 'without']
const METRICS_VALUES: ReadonlyArray<ArchiveReviewMetricsFilter> = ['all', 'with', 'without']
const SORT_VALUES:    ReadonlyArray<ArchiveReviewSort>          = ['priority', 'date_desc', 'date_asc', 'metrics']

const MEDIA_TYPE_LABELS: Record<ArchiveReviewMediaType, string> = {
  IMAGE:          'Image',
  VIDEO:          'Vidéo',
  CAROUSEL_ALBUM: 'Carrousel',
}
const CAPTION_LABELS: Record<ArchiveReviewCaptionFilter, string> = {
  all:     'Toutes',
  with:    'Avec légende',
  without: 'Sans légende IG',
}
const METRICS_LABELS: Record<ArchiveReviewMetricsFilter, string> = {
  all:     'Toutes',
  with:    'Avec métriques',
  without: 'Sans métriques',
}
const SORT_LABELS: Record<ArchiveReviewSort, string> = {
  priority:  'Priorité',
  date_desc: 'Date ↓',
  date_asc:  'Date ↑',
  metrics:   'Engagement (fenêtre)',
}

type RawSearchParams = {
  page?:      string | string[]
  year?:      string | string[]
  mediaType?: string | string[]
  caption?:   string | string[]
  metrics?:   string | string[]
  sort?:      string | string[]
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return n
}

function parseYear(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return null
  // Defensive bounds — Instagram launched in 2010, anything outside this is bogus.
  if (n < 2000 || n > 2100) return null
  return n
}

function parseMediaType(raw: string | undefined): ArchiveReviewMediaType | null {
  if (!raw) return null
  return MEDIA_TYPES_SET.has(raw as ArchiveReviewMediaType)
    ? (raw as ArchiveReviewMediaType)
    : null
}

function parseEnum<T extends string>(
  raw: string | undefined,
  allowed: ReadonlyArray<T>,
  fallback: T
): T {
  if (!raw) return fallback
  return allowed.includes(raw as T) ? (raw as T) : fallback
}

export default async function ArchiveReviewPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const sp = await searchParams

  const page    = parsePage(pickString(sp.page))
  const state: ArchiveReviewFiltersState = {
    year:      parseYear(pickString(sp.year)),
    mediaType: parseMediaType(pickString(sp.mediaType)),
    caption:   parseEnum(pickString(sp.caption), CAPTION_VALUES, 'all'),
    metrics:   parseEnum(pickString(sp.metrics), METRICS_VALUES, 'all'),
    sort:      parseEnum(pickString(sp.sort),    SORT_VALUES,    'priority'),
  }

  const supabase = await createServerSupabaseClient()
  const queue    = await getArchiveReviewQueue(supabase, {
    page,
    year:      state.year,
    mediaType: state.mediaType,
    caption:   state.caption,
    metrics:   state.metrics,
    sort:      state.sort,
  })

  const totalPages = Math.max(1, Math.ceil(queue.total / queue.pageSize))
  const safePage   = Math.min(page, totalPages)
  const hasPrev    = safePage > 1
  const hasNext    = safePage < totalPages

  const sqlFiltersActive =
    state.year !== null || state.mediaType !== null || state.caption !== 'all'

  const activeFilterLabels: string[] = []
  if (state.year !== null)        activeFilterLabels.push(`Année ${state.year}`)
  if (state.mediaType)            activeFilterLabels.push(MEDIA_TYPE_LABELS[state.mediaType])
  if (state.caption !== 'all')    activeFilterLabels.push(`Légende : ${CAPTION_LABELS[state.caption]}`)
  if (state.metrics !== 'all')    activeFilterLabels.push(`Métriques : ${METRICS_LABELS[state.metrics]}`)
  if (state.sort !== 'priority')  activeFilterLabels.push(`Tri : ${SORT_LABELS[state.sort]}`)

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Archive Pattern Library"
        title="File de revue archive"
        description="Liste lecture seule des posts à revoir en priorité. Aucune action destructive ni IA. La file se met à jour naturellement à mesure que le backfill métadonnées progresse — l'ordre peut donc évoluer entre deux visites."
        actions={
          <>
            <Link
              href="/content-lab/archive"
              className="text-xs font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-300"
            >
              ← État d'indexation
            </Link>
            <Link
              href="/content-lab/taxonomy"
              className="text-xs font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-300"
            >
              Taxonomie →
            </Link>
          </>
        }
      />

      <ArchiveReviewFilters
        basePath={BASE_PATH}
        state={state}
        facets={queue.facets}
      />

      <section className="space-y-3">
        <SectionHeader
          title="Couverture de la priorisation"
          description="Les filtres année / média / légende réduisent d'abord le corpus éligible. La priorisation est ensuite calculée sur une fenêtre maximale de 2 000 posts. Les filtres liés aux métriques dépendent des métriques déjà disponibles."
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile
            label="Total éligible"
            value={NF.format(queue.kpis.eligibleTotal)}
            hint="metadata = imported · revue humaine = pending"
          />
          <KpiTile
            label="Corpus filtré"
            value={NF.format(queue.kpis.filteredEligibleTotal)}
            hint={
              sqlFiltersActive
                ? 'Après année / média / légende'
                : 'Aucun filtre SQL actif'
            }
          />
          <KpiTile
            label="Fenêtre analysée"
            value={NF.format(queue.kpis.candidateWindow)}
            hint={
              queue.windowed
                ? `Limite ${NF.format(queue.kpis.candidateWindowLimit)} · plus récents d'abord`
                : 'Tout le corpus filtré tient dans la fenêtre'
            }
          />
          <KpiTile
            label="Résultat affiché"
            value={NF.format(queue.kpis.resultCount)}
            hint={
              state.metrics !== 'all'
                ? `Après filtre métriques (${METRICS_LABELS[state.metrics]})`
                : 'Posts triés présentés à la pagination'
            }
          />
          <KpiTile
            label="Avec légende"
            value={PCT.format(queue.kpis.captionPresentShare)}
            hint="Part de la fenêtre analysée"
          />
          <KpiTile
            label="Avec métriques"
            value={PCT.format(queue.kpis.withMetricsShare)}
            hint="Part de la fenêtre avec ≥ 1 ligne post_metrics_daily"
          />
        </div>
        {queue.windowed ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Priorisation calculée sur une fenêtre de{' '}
            <strong className="tabular-nums">
              {NF.format(queue.kpis.candidateWindow)}
            </strong>{' '}
            posts parmi{' '}
            <strong className="tabular-nums">
              {NF.format(queue.kpis.filteredEligibleTotal)}
            </strong>{' '}
            {sqlFiltersActive ? 'éligibles filtrés' : 'éligibles'}. Les posts plus
            anciens entreront dans la fenêtre à mesure que les plus récents passeront
            en revue humaine.
          </p>
        ) : null}
        {activeFilterLabels.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wide">Filtres actifs :</span>{' '}
            {activeFilterLabels.join(' · ')}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Posts à revoir"
          description={
            state.sort === 'metrics'
              ? "Tri : engagement (likes + commentaires) parmi les métriques disponibles dans la fenêtre."
              : state.sort === 'date_desc'
                ? 'Tri : posté du plus récent au plus ancien.'
                : state.sort === 'date_asc'
                  ? 'Tri : posté du plus ancien au plus récent.'
                  : 'Tri : score décroissant, puis posté le plus récent. Les chips « Pourquoi prioritisé » détaillent les bonus appliqués.'
          }
        />

        {queue.items.length === 0 ? (
          <EmptyState
            title="Aucun post à revoir pour l'instant."
            description={
              queue.kpis.eligibleTotal === 0
                ? "Le backfill métadonnées n'a encore rien indexé en attente de revue. Cette page se remplira au fil des runs."
                : queue.kpis.filteredEligibleTotal === 0
                  ? 'Aucun post éligible avec ces filtres. Élargis les filtres ou réinitialise.'
                  : 'Aucun post sur cette page. Reviens à la première page.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {queue.items.map((item) => (
              <ArchiveReviewRow key={item.postId} item={item} />
            ))}
          </div>
        )}

        {queue.total > 0 ? (
          <nav
            aria-label="Pagination"
            className="flex items-center justify-between gap-3 pt-2 text-sm"
          >
            <span className="text-xs text-muted-foreground">
              Page {NF.format(safePage)} / {NF.format(totalPages)} ·{' '}
              {NF.format(queue.total)} posts dans le résultat affiché
            </span>
            <div className="flex items-center gap-2">
              <PagerLink
                href={buildArchiveReviewHref(BASE_PATH, state, { page: safePage - 1 })}
                disabled={!hasPrev}
              >
                ← Précédent
              </PagerLink>
              <PagerLink
                href={buildArchiveReviewHref(BASE_PATH, state, { page: safePage + 1 })}
                disabled={!hasNext}
              >
                Suivant →
              </PagerLink>
            </div>
          </nav>
        ) : null}
      </section>
    </div>
  )
}

function PagerLink({
  href,
  disabled,
  children,
}: {
  href:     string
  disabled: boolean
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-muted"
    >
      {children}
    </Link>
  )
}

export const metadata = {
  title: 'File de revue archive — Creator Hub',
}
