'use client'
import Link from 'next/link'
import type { TTopPost } from '@creator-hub/types'

type Props = { posts: TTopPost[] }

const FORMAT_LABEL: Record<string, string> = {
  IMAGE:          'Image',
  VIDEO:          'Vidéo',
  CAROUSEL_ALBUM: 'Carousel',
  REEL:           'Reel',
  STORY:          'Story',
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 70 ? 'bg-emerald-500/15 text-emerald-400' :
    score >= 40 ? 'bg-amber-500/15  text-amber-400'   :
                  'bg-neutral-800   text-neutral-400'
  return (
    <span className={`inline-flex h-6 items-center rounded px-1.5 text-xs font-semibold tabular-nums ${cls}`}>
      {score}
    </span>
  )
}

export function PostExplorer({ posts }: Props) {
  if (posts.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-sm text-neutral-500">
        Aucun post dans cette période
      </div>
    )
  }

  return (
    <div className="overflow-auto rounded-lg border border-neutral-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 bg-neutral-900">
            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500">Format</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500">Caption</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">Reach</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">Saves</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">Shares</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">Score*</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {posts.map((post) => (
            <tr key={post.id} className="transition-colors hover:bg-neutral-900/60">
              <td className="px-4 py-3">
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300">
                  {FORMAT_LABEL[post.mediaType] ?? post.mediaType}
                </span>
              </td>
              <td className="max-w-xs px-4 py-3">
                <Link
                  href={`/analytics/post/${post.id}`}
                  className="block truncate text-neutral-300 hover:text-white"
                >
                  {post.caption ?? <span className="italic text-neutral-600">Sans caption</span>}
                </Link>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-neutral-400">
                {post.reach.toLocaleString('fr-FR')}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-neutral-400">
                {post.saves.toLocaleString('fr-FR')}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-neutral-400">
                {post.shares.toLocaleString('fr-FR')}
              </td>
              <td className="px-4 py-3 text-right">
                <ScoreBadge score={post.score} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-neutral-800 bg-neutral-900/50 px-4 py-2 text-xs text-neutral-600">
        * Score provisoire (pondération saves/shares/comments/likes/profile_visits) —
        sera remplacé par <code>mart_post_performance</code> (dbt Sprint 3+)
      </p>
    </div>
  )
}
