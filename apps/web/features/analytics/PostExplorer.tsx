'use client'

import { useState } from 'react'
import { ExternalLink, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { cn, formatNumber, formatDate } from '@/lib/utils'
import type { TPostPerformance, TMediaType } from '@creator-hub/types'

type TSortKey = 'posted_at' | 'score' | 'reach' | 'saves' | 'shares'
type TSortDir = 'asc' | 'desc'

const FORMAT_BADGE: Record<TMediaType, { label: string; color: string }> = {
  REEL: { label: 'Reel', color: 'bg-violet-500/20 text-violet-400' },
  CAROUSEL_ALBUM: { label: 'Carousel', color: 'bg-sky-500/20 text-sky-400' },
  IMAGE: { label: 'Image', color: 'bg-neutral-700 text-neutral-400' },
  STORY: { label: 'Story', color: 'bg-orange-500/20 text-orange-400' },
}

function ScorePill({ score }: { score: number }) {
  const color =
    score >= 75 ? 'bg-emerald-500/20 text-emerald-400' :
    score >= 50 ? 'bg-amber-500/20 text-amber-400' :
    'bg-neutral-700 text-neutral-400'
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', color)}>
      {score}
    </span>
  )
}

function SortIcon({ col, activeCol, dir }: { col: TSortKey; activeCol: TSortKey; dir: TSortDir }) {
  if (col !== activeCol) return <ArrowUpDown size={12} className="text-neutral-600" />
  return dir === 'desc'
    ? <ArrowDown size={12} className="text-neutral-300" />
    : <ArrowUp size={12} className="text-neutral-300" />
}

interface PostExplorerProps {
  posts: TPostPerformance[]
}

export function PostExplorer({ posts }: PostExplorerProps) {
  const [sortKey, setSortKey] = useState<TSortKey>('posted_at')
  const [sortDir, setSortDir] = useState<TSortDir>('desc')

  function handleSort(key: TSortKey) {
    if (key === sortKey) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...posts].sort((a, b) => {
    let diff: number
    if (sortKey === 'posted_at') {
      diff = new Date(a.posted_at).getTime() - new Date(b.posted_at).getTime()
    } else {
      diff = a[sortKey] - b[sortKey]
    }
    return sortDir === 'desc' ? -diff : diff
  })

  const COLS: { key: TSortKey; label: string; align?: string }[] = [
    { key: 'posted_at', label: 'Date' },
    { key: 'score', label: 'Score', align: 'center' },
    { key: 'reach', label: 'Reach', align: 'right' },
    { key: 'saves', label: 'Saves', align: 'right' },
    { key: 'shares', label: 'Shares', align: 'right' },
  ]

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-800">
        <h2 className="text-sm font-semibold text-white">Posts</h2>
        <p className="text-xs text-neutral-500 mt-0.5">{posts.length} publications sur la période</p>
      </div>

      {posts.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-neutral-500">
          Aucun post sur cette période.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-800/50">
                <th className="px-5 py-3 text-left text-xs font-medium text-neutral-500">Format</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-neutral-500 max-w-xs">Caption</th>
                {COLS.map(({ key, label, align }) => (
                  <th
                    key={key}
                    className={cn(
                      'px-4 py-3 text-xs font-medium text-neutral-500 cursor-pointer select-none whitespace-nowrap',
                      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
                    )}
                    onClick={() => handleSort(key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <SortIcon col={key} activeCol={sortKey} dir={sortDir} />
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {sorted.map((post) => {
                const badge = FORMAT_BADGE[post.media_type]
                return (
                  <tr key={post.post_id} className="hover:bg-neutral-800/60 transition-colors">
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', badge.color)}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 max-w-xs">
                      <span className="truncate block text-neutral-300 text-xs">
                        {post.caption ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs text-neutral-500">
                      {formatDate(post.posted_at)}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <ScorePill score={post.score} />
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs font-medium text-neutral-200 tabular-nums">
                      {formatNumber(post.reach)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs font-medium text-emerald-400 tabular-nums">
                      {formatNumber(post.saves)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs font-medium text-amber-400 tabular-nums">
                      {formatNumber(post.shares)}
                    </td>
                    <td className="px-4 py-3.5">
                      <a
                        href={post.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neutral-600 hover:text-neutral-300 transition-colors"
                      >
                        <ExternalLink size={13} />
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
