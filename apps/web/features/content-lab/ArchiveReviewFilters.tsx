import * as React from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import type {
  ArchiveReviewCaptionFilter,
  ArchiveReviewFacets,
  ArchiveReviewMediaType,
  ArchiveReviewMetricsFilter,
  ArchiveReviewSort,
} from '@/lib/meta/queries/archive-review-queue'

const NF = new Intl.NumberFormat('fr-FR')

const MEDIA_TYPE_LABELS: Record<ArchiveReviewMediaType, string> = {
  IMAGE:          'Image',
  VIDEO:          'Vidéo',
  CAROUSEL_ALBUM: 'Carrousel',
}

const SORT_LABELS: Record<ArchiveReviewSort, string> = {
  priority:  'Priorité',
  date_desc: 'Date ↓',
  date_asc:  'Date ↑',
  metrics:   'Engagement (fenêtre)',
}

const SORT_OPTIONS: ArchiveReviewSort[] = [
  'priority',
  'date_desc',
  'date_asc',
  'metrics',
]

const CAPTION_OPTIONS: { value: ArchiveReviewCaptionFilter; label: string }[] = [
  { value: 'all',     label: 'Toutes' },
  { value: 'with',    label: 'Avec' },
  { value: 'without', label: 'Sans légende IG' },
]

const METRICS_OPTIONS: { value: ArchiveReviewMetricsFilter; label: string }[] = [
  { value: 'all',     label: 'Toutes' },
  { value: 'with',    label: 'Avec métriques' },
  { value: 'without', label: 'Sans métriques' },
]

export type ArchiveReviewFiltersState = {
  year:      number | null
  mediaType: ArchiveReviewMediaType | null
  caption:   ArchiveReviewCaptionFilter
  metrics:   ArchiveReviewMetricsFilter
  sort:      ArchiveReviewSort
}

export const DEFAULT_FILTERS_STATE: ArchiveReviewFiltersState = {
  year:      null,
  mediaType: null,
  caption:   'all',
  metrics:   'all',
  sort:      'priority',
}

type Override = Partial<ArchiveReviewFiltersState> & { page?: number | null }

export function buildArchiveReviewHref(
  base: string,
  state: ArchiveReviewFiltersState,
  override: Override = {}
): string {
  const merged = { ...state, ...override }
  const params = new URLSearchParams()

  if (merged.year !== null && merged.year !== undefined) {
    params.set('year', String(merged.year))
  }
  if (merged.mediaType) {
    params.set('mediaType', merged.mediaType)
  }
  if (merged.caption && merged.caption !== 'all') {
    params.set('caption', merged.caption)
  }
  if (merged.metrics && merged.metrics !== 'all') {
    params.set('metrics', merged.metrics)
  }
  if (merged.sort && merged.sort !== 'priority') {
    params.set('sort', merged.sort)
  }

  const targetPage = override.page === null
    ? null
    : (override.page ?? null)
  if (targetPage !== null && targetPage > 1) {
    params.set('page', String(targetPage))
  }

  const qs = params.toString()
  return qs.length > 0 ? `${base}?${qs}` : base
}

function FilterChip({
  href,
  active,
  children,
}: {
  href:     string
  active:   boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors',
        active
          ? 'border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-300'
          : 'border-border bg-card text-muted-foreground hover:bg-muted'
      )}
    >
      {children}
    </Link>
  )
}

function FilterRow({
  label,
  children,
}: {
  label:    string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

export function ArchiveReviewFilters({
  basePath,
  state,
  facets,
}: {
  basePath: string
  state:    ArchiveReviewFiltersState
  facets:   ArchiveReviewFacets
}) {
  const filtersAreActive =
    state.year !== null ||
    state.mediaType !== null ||
    state.caption !== 'all' ||
    state.metrics !== 'all' ||
    state.sort !== 'priority'

  return (
    <section
      aria-label="Filtres de la file"
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <FilterRow label="Année">
        <FilterChip
          href={buildArchiveReviewHref(basePath, state, { year: null, page: null })}
          active={state.year === null}
        >
          Toutes
        </FilterChip>
        {facets.years.map((y) => (
          <FilterChip
            key={y}
            href={buildArchiveReviewHref(basePath, state, { year: y, page: null })}
            active={state.year === y}
          >
            {NF.format(y)}
          </FilterChip>
        ))}
      </FilterRow>

      <FilterRow label="Média">
        <FilterChip
          href={buildArchiveReviewHref(basePath, state, { mediaType: null, page: null })}
          active={state.mediaType === null}
        >
          Tous
        </FilterChip>
        {facets.mediaTypes.map((m) => (
          <FilterChip
            key={m}
            href={buildArchiveReviewHref(basePath, state, { mediaType: m, page: null })}
            active={state.mediaType === m}
          >
            {MEDIA_TYPE_LABELS[m] ?? m}
          </FilterChip>
        ))}
      </FilterRow>

      <FilterRow label="Légende IG">
        {CAPTION_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            href={buildArchiveReviewHref(basePath, state, { caption: opt.value, page: null })}
            active={state.caption === opt.value}
          >
            {opt.label}
          </FilterChip>
        ))}
      </FilterRow>

      <FilterRow label="Métriques">
        {METRICS_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            href={buildArchiveReviewHref(basePath, state, { metrics: opt.value, page: null })}
            active={state.metrics === opt.value}
          >
            {opt.label}
          </FilterChip>
        ))}
      </FilterRow>

      <FilterRow label="Tri">
        {SORT_OPTIONS.map((s) => (
          <FilterChip
            key={s}
            href={buildArchiveReviewHref(basePath, state, { sort: s, page: null })}
            active={state.sort === s}
          >
            {SORT_LABELS[s]}
          </FilterChip>
        ))}
      </FilterRow>

      {filtersAreActive ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-xs">
          <span className="text-muted-foreground">
            Filtres actifs — la priorisation et la pagination s'appliquent au
            résultat filtré.
          </span>
          <Link
            href={basePath}
            className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-300"
          >
            Réinitialiser
          </Link>
        </div>
      ) : null}
    </section>
  )
}
