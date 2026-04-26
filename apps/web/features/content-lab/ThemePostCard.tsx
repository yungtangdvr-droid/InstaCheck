'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FORMAT_LABEL, fmtK } from '@/features/analytics/utils'
import {
  DISTRIBUTION_LABEL_CLASS,
  DISTRIBUTION_LABEL_FR,
} from '@/features/analytics/engagement-score'
import { primaryThemeLabel } from './content-analysis-labels'
import type { TThemePost } from './get-content-analysis'

// Read-only preview card used by the Theme Explorer grid. Falls back to a
// neutral tile when the Meta CDN URL has expired or wasn't captured. Mirrors
// the same defensive <img> + onError pattern as PostMediaPreview.
export function ThemePostCard({ post }: { post: TThemePost }) {
  const [broken, setBroken] = useState(false)
  const showPlaceholder = !post.previewUrl || broken
  const labelCls = DISTRIBUTION_LABEL_CLASS[post.circulationLabel]
  const labelFr  = DISTRIBUTION_LABEL_FR[post.circulationLabel]
  const previewText =
    (post.visibleText ?? post.caption ?? '').trim().slice(0, 120)

  return (
    <Link
      href={`/analytics/post/${post.postId}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 transition-colors hover:border-neutral-700"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-neutral-950">
        {showPlaceholder ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-neutral-600">
            {FORMAT_LABEL[post.mediaType] ?? post.mediaType}
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.previewUrl ?? undefined}
            alt={post.caption ?? ''}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            onError={() => setBroken(true)}
          />
        )}
        <div className="absolute left-2 top-2 flex gap-1">
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-200 backdrop-blur">
            {FORMAT_LABEL[post.mediaType] ?? post.mediaType}
          </span>
        </div>
        <div className="absolute right-2 top-2">
          <span
            className={`inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-medium backdrop-blur ${labelCls}`}
            title={`Score circulation ${post.circulationScore}/100 — ${labelFr} (vs ta baseline 30j du même format)`}
          >
            <span className="tabular-nums">{post.circulationScore}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-[11px] uppercase tracking-wide text-neutral-500">
          {primaryThemeLabel(post.primaryTheme)}
        </p>
        <p className="line-clamp-3 text-xs text-neutral-300">
          {previewText.length > 0
            ? previewText
            : <span className="italic text-neutral-600">Sans texte visible</span>}
        </p>
        <div className="mt-auto grid grid-cols-3 gap-1 border-t border-neutral-800 pt-2 text-[11px] text-neutral-400">
          <Stat label="Reach"  value={fmtK(post.reach)}  />
          <Stat label="Saves"  value={fmtK(post.saves)}  />
          <Stat label="Shares" value={fmtK(post.shares)} highlight />
        </div>
      </div>
    </Link>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label:     string
  value:     string
  highlight?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-neutral-600">{label}</p>
      <p className={`tabular-nums ${highlight ? 'text-amber-400' : 'text-neutral-300'}`}>
        {value}
      </p>
    </div>
  )
}
