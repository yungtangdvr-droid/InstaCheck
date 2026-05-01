'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

import { RADAR_WINDOWS, type TRadarWindow } from './get-radar-feed'

type SourceOption = { id: string; label: string }

const WINDOW_LABELS: Record<TRadarWindow, string> = {
  '24h': '24h',
  '48h': '48h',
  '7d':  '7j',
  '30d': '30j',
}

type RadarFiltersProps = {
  window:   TRadarWindow
  sourceId: string // 'all' | <uuid>
  sources:  SourceOption[]
}

export function RadarFilters({ window, sourceId, sources }: RadarFiltersProps) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const updateParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams?.toString() ?? '')
      next.set(key, value)
      router.push(`?${next.toString()}`)
    },
    [router, searchParams],
  )

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Pills
        label="Fenêtre"
        value={window}
        options={RADAR_WINDOWS.map((w) => ({ value: w, label: WINDOW_LABELS[w] }))}
        onChange={(v) => updateParam('window', v)}
      />
      <Select
        label="Source"
        value={sourceId}
        options={[
          { value: 'all', label: 'Toutes les sources' },
          ...sources.map((s) => ({ value: s.id, label: s.label })),
        ]}
        onChange={(v) => updateParam('source', v)}
      />
    </div>
  )
}

function Pills({
  label,
  value,
  options,
  onChange,
}: {
  label:    string
  value:    string
  options:  { value: string; label: string }[]
  onChange: (next: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              value === o.value
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label:    string
  value:    string
  options:  { value: string; label: string }[]
  onChange: (next: string) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-ring focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
