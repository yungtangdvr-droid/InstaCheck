'use client'

import type { ContentLabPost } from '@creator-hub/types'
import { TagManager } from './TagManager'

const MEDIA_LABELS: Record<string, string> = {
  REEL:           'Reel',
  CAROUSEL_ALBUM: 'Carousel',
  IMAGE:          'Image',
  VIDEO:          'Video',
  STORY:          'Story',
}

export function ReplicablePostCard({ post }: { post: ContentLabPost }) {
  const deltaColor =
    post.scoreDelta >=  10 ? 'text-emerald-400' :
    post.scoreDelta >= -10 ? 'text-neutral-300' :
                             'text-red-400'
  const deltaSign = post.scoreDelta > 0 ? '+' : ''

  const multiplierColor =
    post.savesMultiplier == null ? 'text-neutral-600' :
    post.savesMultiplier >= 1.5   ? 'text-emerald-400' :
    post.savesMultiplier >= 0.8   ? 'text-neutral-300' :
                                    'text-red-400'

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between">
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-300">
          {MEDIA_LABELS[post.mediaType] ?? post.mediaType}
        </span>
        <span
          className={`text-sm font-semibold ${deltaColor}`}
          title={`Score absolu: ${post.score}/100 (baseline 50).`}
        >
          {deltaSign}{post.scoreDelta} vs moy.
        </span>
      </div>

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
