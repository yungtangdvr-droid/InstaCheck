'use client'

import type { ContentLabPost } from '@creator-hub/types'
import { TagManager } from './TagManager'
import {
  RANK_LABEL_CLASS,
  RANK_LABEL_FR,
  rankLabel,
} from '@/features/analytics/ranking'

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
}: {
  post: ContentLabPost
  sampleSize: number
}) {
  const label = rankLabel(post.percentile, sampleSize)

  const multiplierColor =
    post.savesMultiplier == null ? 'text-neutral-600' :
    post.savesMultiplier >= 1.5   ? 'text-emerald-400' :
    post.savesMultiplier >= 0.8   ? 'text-neutral-300' :
                                    'text-red-400'

  const rankTooltip = [
    post.percentile != null ? `Percentile ${post.percentile} (30 j)` : null,
    post.rankScore  != null ? `Ratio baseline ×${post.rankScore.toFixed(2)}` : null,
    `Score mart ${post.score}/100`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-300">
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
            className="rounded border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-500"
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
          className="aspect-square w-full rounded-md bg-neutral-950 object-cover"
          onError={(e) => {
            const el = e.currentTarget
            el.style.display = 'none'
          }}
        />
      ) : (
        <div
          className="flex aspect-square w-full items-center justify-center rounded-md bg-neutral-950 text-xs text-neutral-600"
          title="Aucun aperçu disponible — voir sur Instagram."
        >
          {MEDIA_LABELS[post.mediaType] ?? post.mediaType}
        </div>
      )}

      <div className="flex items-baseline gap-2 text-xs text-neutral-500">
        <span>Saves</span>
        <span className={`text-base font-semibold tabular-nums ${multiplierColor}`}>
          {post.savesMultiplier == null ? '—' : `×${post.savesMultiplier.toFixed(1)}`}
        </span>
        <span className="text-neutral-600">vs baseline format</span>
      </div>

      <p className="line-clamp-3 min-h-[3.75rem] text-sm text-neutral-300">
        {post.caption ?? <span className="italic text-neutral-600">Sans légende IG</span>}
      </p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-600">
        <div>Saves <span className="text-neutral-400">{post.metrics.saves}</span></div>
        <div>Shares <span className="text-neutral-400">{post.metrics.shares}</span></div>
        <div>Comments <span className="text-neutral-400">{post.metrics.comments}</span></div>
        <div>Reach <span className="text-neutral-400">{post.metrics.reach}</span></div>
      </dl>

      <TagManager postId={post.id} initialTags={post.tags} />

      {post.permalink && (
        <a
          href={post.permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-neutral-500 transition-colors hover:text-neutral-300"
        >
          Voir sur Instagram →
        </a>
      )}
    </div>
  )
}
