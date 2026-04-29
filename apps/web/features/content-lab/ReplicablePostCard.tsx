'use client'

import type { ContentLabPost } from '@creator-hub/types'
import { TagManager } from './TagManager'
import {
  RANK_LABEL_CLASS,
  RANK_LABEL_FR,
  rankLabel,
} from '@/features/analytics/ranking'
import {
  formatPatternLabel,
  primaryThemeLabel,
  replicationLevelLabel,
} from './content-analysis-labels'

// Compact per-card content analysis signal. Plain object so RSC → client
// serialisation is trivial; mirrors the projection from getContentSignalsForPosts.
export type TPostCardContentSignal = {
  primaryTheme:         string | null
  formatPattern:        string | null
  replicationPotential: string | null
}

const MEDIA_LABELS: Record<string, string> = {
  REEL:           'Reel',
  CAROUSEL_ALBUM: 'Carousel',
  IMAGE:          'Image',
  VIDEO:          'Video',
  STORY:          'Story',
}

export function ReplicablePostCard({
  post,
  sampleSize,
  contentSignal,
}: {
  post: ContentLabPost
  sampleSize: number
  contentSignal?: TPostCardContentSignal | null
}) {
  const label = rankLabel(post.percentile, sampleSize)

  const multiplierColor =
    post.savesMultiplier == null ? 'text-muted-foreground' :
    post.savesMultiplier >= 1.5   ? 'text-success'         :
    post.savesMultiplier >= 0.8   ? 'text-foreground'      :
                                    'text-danger'

  const rankTooltip = [
    post.percentile != null ? `Percentile ${post.percentile} (30 j)` : null,
    post.rankScore  != null ? `Ratio baseline ×${post.rankScore.toFixed(2)}` : null,
    `Score mart ${post.score}/100`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
          {MEDIA_LABELS[post.mediaType] ?? post.mediaType}
        </span>
        {label ? (
          <span
            className={`rounded border px-2 py-0.5 text-[11px] font-medium ${RANK_LABEL_CLASS[label]}`}
            title={rankTooltip}
          >
            {RANK_LABEL_FR[label]}
          </span>
        ) : (
          <span
            className="rounded border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            title={rankTooltip + ' — échantillon insuffisant pour un rang'}
          >
            Rang indisponible
          </span>
        )}
      </div>

      {post.previewUrl ? (
        // Plain <img>: Meta CDN URLs rotate. See note in PostExplorer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.previewUrl}
          alt=""
          loading="lazy"
          className="aspect-square w-full rounded-md bg-muted object-cover"
          onError={(e) => {
            const el = e.currentTarget
            el.style.display = 'none'
          }}
        />
      ) : (
        <div
          className="flex aspect-square w-full items-center justify-center rounded-md bg-muted text-xs text-muted-foreground"
          title="Aucun aperçu disponible — voir sur Instagram."
        >
          {MEDIA_LABELS[post.mediaType] ?? post.mediaType}
        </div>
      )}

      <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
        <span>Saves</span>
        <span className={`text-base font-semibold tabular-nums ${multiplierColor}`}>
          {post.savesMultiplier == null ? '—' : `×${post.savesMultiplier.toFixed(1)}`}
        </span>
        <span className="text-muted-foreground">vs baseline format</span>
      </div>

      <p className="line-clamp-3 min-h-[3.75rem] text-sm text-card-foreground">
        {post.caption ?? <span className="italic text-muted-foreground">Sans légende IG</span>}
      </p>

      {contentSignal && <ContentSignalLine signal={contentSignal} />}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <div>Saves <span className="text-foreground">{post.metrics.saves}</span></div>
        <div>Shares <span className="text-foreground">{post.metrics.shares}</span></div>
        <div>Comments <span className="text-foreground">{post.metrics.comments}</span></div>
        <div>Reach <span className="text-foreground">{post.metrics.reach}</span></div>
      </dl>

      <TagManager postId={post.id} initialTags={post.tags} />

      {post.permalink && (
        <a
          href={post.permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Voir sur Instagram →
        </a>
      )}
    </div>
  )
}

// Compact one-line signal: "Theme · format · replication potential".
// Skips segments whose source field is null or 'unknown' so the line stays
// honest — we never invent labels just to fill the row.
function ContentSignalLine({ signal }: { signal: TPostCardContentSignal }) {
  const parts: string[] = []
  if (signal.primaryTheme && signal.primaryTheme !== 'unknown') {
    parts.push(primaryThemeLabel(signal.primaryTheme))
  }
  if (signal.formatPattern && signal.formatPattern !== 'unknown') {
    parts.push(formatPatternLabel(signal.formatPattern))
  }
  if (signal.replicationPotential && signal.replicationPotential !== 'unknown') {
    parts.push(replicationLevelLabel(signal.replicationPotential))
  }
  if (parts.length === 0) return null
  return (
    <p
      className="text-[11px] text-muted-foreground"
      title="Signal éditorial issu de l'analyse de contenu"
    >
      {parts.join(' · ')}
    </p>
  )
}
