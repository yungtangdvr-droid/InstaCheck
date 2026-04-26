'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { FORMAT_LABEL } from '@/features/analytics/utils'
import type { TAnalyticsPeriod } from '@creator-hub/types'
import type { TThemePostSort } from './get-content-analysis'

// Search-param controlled filters for /content-lab/themes/[primaryTheme].
// Server component reads the resolved values back from searchParams; this
// component just rewrites the URL without dropping siblings.
const PERIODS: { value: TAnalyticsPeriod; label: string }[] = [
  { value: 7,  label: '7j' },
  { value: 30, label: '30j' },
  { value: 90, label: '90j' },
]

const SORT_OPTIONS: { value: TThemePostSort; label: string }[] = [
  { value: 'shares',       label: 'Shares' },
  { value: 'saves',        label: 'Saves' },
  { value: 'reach',        label: 'Reach' },
  { value: 'circulation',  label: 'Score circulation' },
]

export function ThemeFilters({
  period,
  mediaType,
  sort,
  formats,
}: {
  period:    TAnalyticsPeriod
  mediaType: string
  sort:      TThemePostSort
  formats:   readonly string[]
}) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  // URLSearchParams.set is the only way to keep the other filters intact when
  // one of them changes. Using router.push('?period=…') alone would wipe
  // mediaType + sort.
  const updateParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams?.toString() ?? '')
      next.set(key, value)
      router.push(`?${next.toString()}`)
    },
    [router, searchParams],
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pills
        label="Période"
        value={String(period)}
        options={PERIODS.map(p => ({ value: String(p.value), label: p.label }))}
        onChange={(v) => updateParam('period', v)}
      />
      <Select
        label="Format"
        value={mediaType}
        options={[
          { value: 'ALL', label: 'Tous formats' },
          ...formats.map(f => ({ value: f, label: FORMAT_LABEL[f] ?? f })),
        ]}
        onChange={(v) => updateParam('format', v)}
      />
      <Select
        label="Tri"
        value={sort}
        options={SORT_OPTIONS.map(s => ({ value: s.value, label: s.label }))}
        onChange={(v) => updateParam('sort', v)}
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
      <span className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <div className="flex gap-1 rounded-lg border border-neutral-800 bg-neutral-900 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              value === o.value
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:text-white'
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
      <span className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 focus:border-neutral-700 focus:outline-none"
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
