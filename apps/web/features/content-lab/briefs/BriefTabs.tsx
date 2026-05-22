'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

import type { BriefTabCounts } from './get-briefs'

export const BRIEF_VIEWS = ['draft', 'kept', 'all'] as const
export type BriefView = (typeof BRIEF_VIEWS)[number]
export const DEFAULT_BRIEF_VIEW: BriefView = 'draft'

const LABELS: Record<BriefView, string> = {
  draft: 'Drafts',
  kept:  'Kept',
  all:   'All',
}

export function isBriefView(value: string | undefined | null): value is BriefView {
  return value != null && (BRIEF_VIEWS as readonly string[]).includes(value)
}

interface Props {
  view:   BriefView
  counts: BriefTabCounts
}

export function BriefTabs({ view, counts }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const update = useCallback(
    (next: BriefView) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '')
      if (next === DEFAULT_BRIEF_VIEW) {
        params.delete('view')
      } else {
        params.set('view', next)
      }
      const qs = params.toString()
      router.push(qs.length > 0 ? `?${qs}` : '?')
    },
    [router, searchParams],
  )

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Vue</span>
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
        {BRIEF_VIEWS.map((v) => {
          const active = v === view
          const count  = v === 'all'
            ? counts.all
            : v === 'draft'
              ? counts.draft
              : counts.kept
          return (
            <button
              key={v}
              type="button"
              onClick={() => update(v)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{LABELS[v]}</span>
              <span
                className={`tabular-nums text-[10px] ${
                  active ? 'text-foreground/70' : 'text-muted-foreground/70'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
