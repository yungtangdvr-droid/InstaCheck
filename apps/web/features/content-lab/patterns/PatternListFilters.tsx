'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

// Lightweight URL-driven filter row for the patterns index. Keeps siblings
// intact when one filter changes, mirroring ThemeFilters.

export type TPatternRecommendationFilter = 'all' | 'replicate' | 'adapt' | 'drop'
export type TPatternStrengthFilter       = 'all' | 'strong' | 'moderate' | 'weak'
export type TPatternFormatFilter         = 'ALL' | 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'

const REC_OPTIONS: { value: TPatternRecommendationFilter; label: string }[] = [
  { value: 'all',       label: 'Toutes' },
  { value: 'replicate', label: 'Répliquer' },
  { value: 'adapt',     label: 'Adapter' },
  { value: 'drop',      label: 'Abandonner' },
]

const STRENGTH_OPTIONS: { value: TPatternStrengthFilter; label: string }[] = [
  { value: 'all',      label: 'Tous signaux' },
  { value: 'strong',   label: 'Fort' },
  { value: 'moderate', label: 'Modéré' },
  { value: 'weak',     label: 'Faible' },
]

const FORMAT_OPTIONS: { value: TPatternFormatFilter; label: string }[] = [
  { value: 'ALL',            label: 'Tous formats' },
  { value: 'IMAGE',          label: 'Image' },
  { value: 'VIDEO',          label: 'Vidéo' },
  { value: 'CAROUSEL_ALBUM', label: 'Carousel' },
]

export function PatternListFilters({
  recommendation,
  strength,
  format,
}: {
  recommendation: TPatternRecommendationFilter
  strength:       TPatternStrengthFilter
  format:         TPatternFormatFilter
}) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const updateParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams?.toString() ?? '')
      if (value === 'all' || value === 'ALL') next.delete(key)
      else next.set(key, value)
      router.push(`?${next.toString()}`)
    },
    [router, searchParams],
  )

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        label="Reco"
        value={recommendation}
        options={REC_OPTIONS}
        onChange={(v) => updateParam('reco', v)}
      />
      <Select
        label="Signal"
        value={strength}
        options={STRENGTH_OPTIONS}
        onChange={(v) => updateParam('strength', v)}
      />
      <Select
        label="Format"
        value={format}
        options={FORMAT_OPTIONS}
        onChange={(v) => updateParam('format', v)}
      />
    </div>
  )
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label:    string
  value:    T
  options:  { value: T; label: string }[]
  onChange: (next: T) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
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
