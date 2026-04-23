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
