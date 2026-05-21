import type {
  TCreativePattern,
  TCreativePatternExample,
  TPatternIdea,
  TPatternIdeaAction,
  TPatternIdeaExample,
} from '@creator-hub/types'
import {
  formatPatternLabel,
  humorTypeLabel,
  primaryThemeLabel,
} from '../content-analysis-labels'
import { buildPatternHeadline } from '../patterns/build-pattern-reason'

// Pure, deterministic mapping from a (pattern + examples + post meta) tuple
// to a TPatternIdea. No I/O, no randomness — same input ⇒ same output.

const MEDIA_LABEL_FR: Record<string, string> = {
  IMAGE:          'Image',
  VIDEO:          'Vidéo',
  CAROUSEL_ALBUM: 'Carousel',
}

function mediaLabel(value: string | null | undefined): string {
  if (!value) return 'Format inconnu'
  return MEDIA_LABEL_FR[value] ?? value
}

function fmtMultiplier(value: number | null): string {
  if (value == null) return '–'
  return `×${value.toFixed(2)}`
}

function fmtPct(value: number): string {
  return `${Math.round(value * 100)}%`
}

function snippet(caption: string | null | undefined, max: number): string | null {
  if (!caption) return null
  const trimmed = caption.trim()
  if (trimmed.length === 0)  return null
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(0, max - 1).trimEnd() + '…'
}

const EXAMPLE_LIMIT       = 3
const CAPTION_SNIPPET_MAX = 160

export function decideAction(pattern: TCreativePattern): TPatternIdeaAction {
  if (pattern.signalStrength === 'weak') return 'revisit'
  if (pattern.recommendation === 'replicate') return 'test'
  if (pattern.recommendation === 'adapt')     return 'adapt'
  return 'revisit'
}

export function buildRiskCaveat(pattern: TCreativePattern): string {
  const risks: string[] = []
  if (pattern.signalStrength === 'weak') {
    risks.push('échantillon limité, à confirmer')
  }
  if (pattern.postsLast90d <= 1) {
    risks.push('peu de signal récent sur 90 jours')
  }
  if (pattern.meanSavesMultiplier != null && pattern.meanSavesMultiplier < 1) {
    risks.push('sauvegardé sous la moyenne du compte')
  }
  if (pattern.meanSharesMultiplier != null && pattern.meanSharesMultiplier < 1) {
    risks.push('peu partagé')
  }
  if (risks.length === 0) return 'Aucun risque évident — terrain solide sur l’historique.'
  return risks.map(capitalize).join(' · ')
}

function capitalize(s: string): string {
  if (s.length === 0) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function buildWhyItMightWork(pattern: TCreativePattern): string {
  const theme  = primaryThemeLabel(pattern.primaryTheme).toLowerCase()
  const format = formatPatternLabel(pattern.formatPattern).toLowerCase()
  const tone   = humorTypeLabel(pattern.humorType).toLowerCase()
  const stats =
    `Score ajusté ${pattern.bayesAdjustedScore.toFixed(0)}/100, ` +
    `saves ${fmtMultiplier(pattern.meanSavesMultiplier)}, ` +
    `shares ${fmtMultiplier(pattern.meanSharesMultiplier)}, ` +
    `${fmtPct(pattern.shareAboveBaseline)} des posts au-dessus de la baseline`

  if (pattern.recommendation === 'replicate') {
    return (
      `${stats}. ` +
      `Re-décliner l’angle ${theme} avec un ${format} et une tonalité ${tone} ` +
      `est la voie la plus probable — c’est la combinaison qui a déjà sur-performé sur ce compte.`
    )
  }
  return (
    `${stats}. ` +
    `Garder l’angle ${theme} et la tonalité ${tone}, mais changer l’enveloppe (${format} alternatif, ` +
    `hook plus court, autre référence visuelle) plutôt que de répliquer tel quel.`
  )
}

export function buildPatternIdea(
  pattern:  TCreativePattern,
  examples: TCreativePatternExample[],
  postMeta: Map<string, { caption: string | null; permalink: string | null }>,
): TPatternIdea {
  const headline = buildPatternHeadline(pattern)
  const suggestedFormat =
    `${mediaLabel(pattern.mediaType)} · ${formatPatternLabel(pattern.formatPattern)}`

  const ideaExamples: TPatternIdeaExample[] = examples
    .slice(0, EXAMPLE_LIMIT)
    .map((ex) => {
      const m = postMeta.get(ex.postId)
      return {
        postId:           ex.postId,
        permalink:        m?.permalink ?? null,
        captionSnippet:   snippet(m?.caption, CAPTION_SNIPPET_MAX),
        performanceScore: ex.performanceScore,
        savesMultiplier:  ex.savesMultiplier,
        sharesMultiplier: ex.sharesMultiplier,
      }
    })

  return {
    sourcePatternKey: pattern.patternKey,
    headline,
    suggestedAngle:   primaryThemeLabel(pattern.primaryTheme),
    suggestedFormat,
    suggestedTone:    humorTypeLabel(pattern.humorType),
    whyItMightWork:   buildWhyItMightWork(pattern),
    riskCaveat:       buildRiskCaveat(pattern),
    suggestedAction:  decideAction(pattern),
    evidence: {
      sampleSize:           pattern.sampleSize,
      postsLast90d:         pattern.postsLast90d,
      bayesAdjustedScore:   pattern.bayesAdjustedScore,
      meanSavesMultiplier:  pattern.meanSavesMultiplier,
      meanSharesMultiplier: pattern.meanSharesMultiplier,
      shareAboveBaseline:   pattern.shareAboveBaseline,
      signalStrength:       pattern.signalStrength,
    },
    examples: ideaExamples,
  }
}
