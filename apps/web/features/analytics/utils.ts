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
