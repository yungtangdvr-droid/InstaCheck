import * as React from 'react'

import { cn } from '@/lib/utils'
import type {
  ArchiveReviewItem,
  ArchiveReviewReason,
  TArchiveEra,
} from '@/lib/meta/queries/archive-review-queue'

const NF = new Intl.NumberFormat('fr-FR')

const REASON_LABELS: Record<ArchiveReviewReason, string> = {
  caption_present:       'Légende IG présente',
  metrics_available:     'Métriques disponibles',
  recent_90d:            'Récent (≤ 90 j)',
  recent_365d:           'Récent (≤ 365 j)',
  representative_sample: 'Échantillon représentatif',
  era_outperformer:      'Surperforme sa période',
}

const ERA_LABELS: Record<TArchiveEra, string> = {
  pre_2019:   'Avant 2019',
  '2019_2020': '2019-2020',
  '2021_2022': '2021-2022',
  '2023_2024': '2023-2024',
  '2025_plus': '2025+',
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  IMAGE:          'Image',
  VIDEO:          'Vidéo',
  CAROUSEL_ALBUM: 'Carrousel',
  REEL:           'Reel',
  STORY:          'Story',
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  })
}

function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'info' | 'amber' | 'emerald'
}) {
  const toneClass =
    tone === 'info'
      ? 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300'
      : tone === 'amber'
        ? 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300'
        : tone === 'emerald'
          ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300'
          : 'bg-muted text-muted-foreground border-border'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
        toneClass
      )}
    >
      {children}
    </span>
  )
}

export function ArchiveReviewRow({ item }: { item: ArchiveReviewItem }) {
  const mediaTypeLabel = MEDIA_TYPE_LABELS[item.mediaType] ?? item.mediaType
  const captionTrimmed = item.caption?.trim() ?? ''
  const hasCaption     = captionTrimmed.length > 0

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="info">{mediaTypeLabel}</Chip>
          <span className="text-xs text-muted-foreground">{fmtDate(item.postedAt)}</span>
          {item.era ? <Chip>{ERA_LABELS[item.era]}</Chip> : null}
          <span className="font-mono text-[11px] text-muted-foreground">
            {item.mediaId}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {item.eraNormalizedIndex !== null ? (
            <span
              title="Index vs période comparable (100 = baseline archive même format/année ou même époque)"
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                item.eraNormalizedIndex >= 125
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : item.eraNormalizedIndex >= 90
                    ? 'border-border bg-muted text-card-foreground'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              )}
            >
              index {item.eraNormalizedIndex}
            </span>
          ) : null}
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-card-foreground">
            score {item.score}
          </span>
          <a
            href={item.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-300"
          >
            Voir sur Instagram ↗
          </a>
        </div>
      </header>

      <p
        className={cn(
          'text-sm leading-snug',
          hasCaption ? 'text-card-foreground' : 'italic text-muted-foreground'
        )}
        style={{
          display:           '-webkit-box',
          WebkitLineClamp:   2,
          WebkitBoxOrient:   'vertical',
          overflow:          'hidden',
        }}
      >
        {hasCaption ? captionTrimmed : 'Sans légende IG'}
      </p>

      <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <dt className="uppercase tracking-wide">Likes</dt>
          <dd className="tabular-nums text-card-foreground">
            {item.metrics.likes !== null ? NF.format(item.metrics.likes) : '—'}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="uppercase tracking-wide">Commentaires</dt>
          <dd className="tabular-nums text-card-foreground">
            {item.metrics.comments !== null ? NF.format(item.metrics.comments) : '—'}
          </dd>
        </div>
        {item.metrics.asOfDate ? (
          <div className="flex items-center gap-1.5">
            <dt className="uppercase tracking-wide">Au</dt>
            <dd className="tabular-nums text-card-foreground">
              {fmtDate(item.metrics.asOfDate)}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="emerald">métadonnées : {item.archiveMetadataStatus}</Chip>
        <Chip tone="amber">revue humaine : {item.archiveHumanReviewStatus}</Chip>
      </div>

      {item.reasons.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Pourquoi prioritisé
          </span>
          {item.reasons.map((r) => (
            <Chip key={r}>{REASON_LABELS[r]}</Chip>
          ))}
        </div>
      ) : null}
    </article>
  )
}
