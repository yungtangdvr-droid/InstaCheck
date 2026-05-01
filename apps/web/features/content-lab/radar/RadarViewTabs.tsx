'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

import {
  DEFAULT_RADAR_VIEW,
  RADAR_VIEWS,
  type RadarFeedCounts,
  type TRadarView,
} from './get-radar-feed'

const VIEW_LABELS: Record<TRadarView, string> = {
  all:     'Tous',
  saved:   'Saved',
  new:     'New',
  ignored: 'Ignored',
}

type RadarViewTabsProps = {
  view:   TRadarView
  counts: RadarFeedCounts
}

export function RadarViewTabs({ view, counts }: RadarViewTabsProps) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const updateView = useCallback(
    (next: TRadarView) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '')
      if (next === DEFAULT_RADAR_VIEW) {
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
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Vue</span>
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {RADAR_VIEWS.map((v) => {
            const active = v === view
            const count  = counts[v]
            return (
              <button
                key={v}
                type="button"
                onClick={() => updateView(v)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{VIEW_LABELS[v]}</span>
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
      <p className="text-[11px] text-muted-foreground">
        Saved = shortlist d’idées à exploiter. Ignore = signal négatif pour le ranking.
      </p>
    </div>
  )
}
