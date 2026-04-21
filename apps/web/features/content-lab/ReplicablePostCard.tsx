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

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70 ? 'bg-emerald-500' :
    score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="h-1 w-full rounded-full bg-neutral-800">
      <div
        className={`h-1 rounded-full transition-all ${color}`}
        style={{ width: `${score}%` }}
      />
    </div>
  )
}

export function ReplicablePostCard({ post }: { post: ContentLabPost }) {
  const scoreColor =
    post.score >= 70 ? 'text-emerald-400' :
    post.score >= 40 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between">
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-300">
          {MEDIA_LABELS[post.mediaType] ?? post.mediaType}
        </span>
        <span className={`text-sm font-semibold ${scoreColor}`}>
          {post.score}/100
        </span>
      </div>

      <ScoreBar score={post.score} />

      <p className="line-clamp-3 min-h-[3.75rem] text-sm text-neutral-300">
        {post.caption ?? <span className="italic text-neutral-600">Pas de caption</span>}
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
