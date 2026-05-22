import type {
  TAnalyticsPeriod,
  TPatternIdea,
} from '@creator-hub/types'
import {
  DISTRIBUTION_LABEL_FR,
  DISTRIBUTION_SIGNAL_FR,
  type TDistributionLabel,
  type TDistributionSignal,
} from './engagement-score'

// Inputs are deliberately narrow: this helper does no I/O and never invents
// numbers — it only picks a sentence template from values already fetched by
// the page. Keeping it pure makes the hero deterministic and testable.
export type HeroInput = {
  period:                TAnalyticsPeriod
  lastSyncStatus:        string | null
  lastSyncErrorMessage:  string | null
  lastSyncErrorsCount:   number
  periodPosts:           number
  hasReach:              boolean
  engagementScore:       number | null
  engagementLabel:       TDistributionLabel | null
  engagementDelta:       number | null
  dominantSignal:        TDistributionSignal | null
  baselineQualifier:     string
  topIdea:               TPatternIdea | null
  topPostSavesMultiplier: number | null
}

export type HeroOutput = {
  headline:  string
  secondary: string | null
}

const SIGNAL_VERB: Record<TDistributionSignal, string> = {
  shares:        'partage',
  saves:         'sauvegarde',
  comments:      'commente',
  likes:         'like',
  profileVisits: 'visite ton profil après',
}

function fmtMultiplier(value: number | null): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return `×${value.toFixed(2)}`
}

function fmtSignedScore(delta: number): string {
  const rounded = Math.round(delta)
  if (rounded === 0) return '±0'
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

// Priority-ordered rules. The first one that matches wins; only the matched
// branch contributes copy. Falls back to a neutral summary so the hero is
// always renderable, even on a fresh account with no posts.
export function buildHero(input: HeroInput): HeroOutput {
  // 1) Operational failure beats everything else.
  if (input.lastSyncStatus === 'failed' || input.lastSyncErrorMessage) {
    return {
      headline:  'Sync Meta en échec — relance avant tout le reste.',
      secondary: 'Les chiffres affichés peuvent être datés tant que la synchronisation n’est pas réparée.',
    }
  }
  if (input.lastSyncErrorsCount > 0) {
    return {
      headline:  `Sync terminé avec ${input.lastSyncErrorsCount} erreur${input.lastSyncErrorsCount > 1 ? 's' : ''} partielle${input.lastSyncErrorsCount > 1 ? 's' : ''}.`,
      secondary: 'Une partie des posts ou des insights n’a pas pu être ingérée — vérifie le détail du pipeline.',
    }
  }

  // 2) No data to interpret.
  if (input.periodPosts === 0) {
    return {
      headline:  `Aucun post sur les ${input.period} derniers jours — pas de signal exploitable.`,
      secondary: 'Publie pour générer des données, ou élargis la période.',
    }
  }

  // 3) A strong idea exists → surface it (top creative signal).
  if (input.topIdea && input.topIdea.suggestedAction === 'test') {
    return {
      headline:  `Signal le plus fort : ${input.topIdea.headline}.`,
      secondary: input.topIdea.whyItMightWork,
    }
  }

  // 4) Engagement health swung meaningfully vs the baseline window.
  if (
    input.engagementScore != null &&
    input.engagementLabel &&
    input.engagementDelta != null &&
    Math.abs(input.engagementDelta) >= 5
  ) {
    const direction = input.engagementDelta > 0 ? 'monte' : 'baisse'
    const labelFr   = DISTRIBUTION_LABEL_FR[input.engagementLabel].toLowerCase()
    const signalTail = input.dominantSignal
      ? ` Signal dominant : ${DISTRIBUTION_SIGNAL_FR[input.dominantSignal]}.`
      : ''
    return {
      headline:  `Ta circulation ${direction} (${fmtSignedScore(input.engagementDelta)} pts ${input.baselineQualifier}).`,
      secondary: `Score ${input.engagementScore}/100 — ${labelFr}.${signalTail}`,
    }
  }

  // 5) A dominant audience behaviour, even without a big swing.
  if (input.dominantSignal && input.hasReach) {
    const verb = SIGNAL_VERB[input.dominantSignal]
    const mult = fmtMultiplier(input.topPostSavesMultiplier)
    const tail = mult ? ` Ton meilleur post fait ${mult} sur les saves.` : ''
    return {
      headline:  `Ton audience te ${verb} plus qu’elle ne fait le reste.`,
      secondary: `Capitalise sur ce qui déclenche ce signal sur les ${input.period} derniers jours.${tail}`,
    }
  }

  // 6) Neutral fallback — never invents a delta.
  const labelFr = input.engagementLabel
    ? DISTRIBUTION_LABEL_FR[input.engagementLabel].toLowerCase()
    : null
  const head = `${input.periodPosts} post${input.periodPosts > 1 ? 's' : ''} sur les ${input.period} derniers jours.`
  const tail = input.engagementScore != null && labelFr
    ? `Circulation ${labelFr} (${input.engagementScore}/100 ${input.baselineQualifier}).`
    : null
  return { headline: head, secondary: tail }
}
