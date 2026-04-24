import type { TAnalyticsPeriod } from '@creator-hub/types'

export const VALID_PERIODS = [7, 30, 90] as const

export function parsePeriod(raw: string | undefined): TAnalyticsPeriod {
  const n = parseInt(raw ?? '', 10)
  return (VALID_PERIODS as readonly number[]).includes(n) ? (n as TAnalyticsPeriod) : 30
}

export const FORMAT_LABEL: Record<string, string> = {
  IMAGE:          'Image',
  VIDEO:          'Vidéo',
  CAROUSEL_ALBUM: 'Carousel',
  REEL:           'Reel',
  STORY:          'Story',
}

// mart_best_posting_windows emits day_of_week as ISO (1 = Mon … 7 = Sun).
// The UI (`BestWindowHeatmap`) and the TPostingWindow type expect 0 = Sun …
// 6 = Sat (JS `Date.getDay()` convention). Apply this remap ONCE, at the
// mart → UI boundary in getPostingWindows. Do not apply in the component
// or the double-remap will silently scramble the heatmap.
export function isoDowToSundayFirst(iso: number): number {
  return iso % 7
}

// Compact y-axis / tooltip formatter shared across analytics charts.
// 1 000 → 1k, 12 500 → 12.5k, 1 200 000 → 1.2M. Use to keep Recharts y-axis
// labels within the tick width (otherwise long integers truncate to "00000").
export function fmtK(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}k`
  return String(v)
}
