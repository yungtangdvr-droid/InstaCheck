import type { TCreativePattern } from '@creator-hub/types'
import {
  formatPatternLabel,
  humorTypeLabel,
  primaryThemeLabel,
} from '../content-analysis-labels'

// Plain-French rationale for a pattern's recommendation. Mirrors the tone of
// apps/web/features/content-lab/intelligence/build-reason.ts (per-post
// reasons) without sharing code: the per-post builder takes a candidate row,
// this one takes an aggregated pattern row.

function fmtMultiplier(value: number | null): string {
  if (value == null) return '–'
  return `×${value.toFixed(2)}`
}

export function buildPatternHeadline(pattern: TCreativePattern): string {
  const theme  = primaryThemeLabel(pattern.primaryTheme).toLowerCase()
  const format = formatPatternLabel(pattern.formatPattern).toLowerCase()
  const humor  = humorTypeLabel(pattern.humorType).toLowerCase()
  return `${theme} · ${format} · ${humor}`
}

export function buildPatternReason(pattern: TCreativePattern): string {
  const headline = buildPatternHeadline(pattern)
  const stats =
    `${pattern.sampleSize} post${pattern.sampleSize > 1 ? 's' : ''}, ` +
    `score ajusté ${pattern.bayesAdjustedScore.toFixed(0)}/100, ` +
    `saves ${fmtMultiplier(pattern.meanSavesMultiplier)}, ` +
    `shares ${fmtMultiplier(pattern.meanSharesMultiplier)}`

  switch (pattern.recommendation) {
    case 'replicate':
      return `Famille « ${headline} » à répliquer — ${stats}.`
    case 'adapt':
      return `Famille « ${headline} » à adapter — ${stats}.`
    case 'drop':
      return `Famille « ${headline} » à éviter — ${stats}.`
    default:
      return (
        `Famille « ${headline} » : échantillon insuffisant ` +
        `(${pattern.sampleSize} post${pattern.sampleSize > 1 ? 's' : ''}). ` +
        `Pas de recommandation tant que la famille ne contient pas au moins 4 posts.`
      )
  }
}
