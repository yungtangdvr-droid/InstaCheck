// Engagement Score v1 — rate-based scoring shared across analytics surfaces
// (PostExplorer, post detail, account-level health card, audience page).
//
// Distinct from the percentile rank in `ranking.ts`:
//   - rank.ts answers "where does this post sit vs same-format 30 d baseline"
//     (distribution-relative, percentile within the loaded set).
//   - this module answers "how engaging is this post in absolute rate terms"
//     (saves/reach, shares/reach, …) with a meaningful score band, even when
//     the baseline is too thin for a percentile to be useful.
//
// Weights mirror the reach-rate intuition from the master prompt: saves and
// shares are the most signal-bearing actions; comments and likes are softer
// confirms. Profile visits are intentionally excluded — they're not consistently
// available across media types (VIDEO drops the metric in some contexts) and
// the account-level health is calibrated on the four "share-of-reach" rates.
export const ENGAGEMENT_WEIGHTS = {
  saves:    0.35,
  shares:   0.35,
  comments: 0.15,
  likes:    0.15,
} as const

// Reference rates used to anchor 100 on the score scale. Values come from
// public Instagram benchmarks for an "exceptional" post on a creator account
// (≈ 5 % saves rate, ≈ 5 % shares rate, ≈ 1 % comments rate, ≈ 12 % likes
// rate). Treat these as an absolute reference — when a same-format baseline
// is provided it overrides them. The score is then clamped 0–100.
const REFERENCE_RATES = {
  saves:    0.05,
  shares:   0.05,
  comments: 0.01,
  likes:    0.12,
} as const

export type TEngagementLabel =
  | 'faible'
  | 'moyen'
  | 'bon'
  | 'tres-fort'
  | 'exceptionnel'

export const ENGAGEMENT_LABEL_FR: Record<TEngagementLabel, string> = {
  'faible':       'Faible',
  'moyen':        'Moyen',
  'bon':          'Bon',
  'tres-fort':    'Très fort',
  'exceptionnel': 'Exceptionnel',
}

// Tailwind classes for a subtle gradient/tint matching the dark visual style
// already used across the analytics views.
export const ENGAGEMENT_LABEL_CLASS: Record<TEngagementLabel, string> = {
  'faible':       'bg-red-500/10      text-red-400      border-red-500/20',
  'moyen':        'bg-amber-500/10    text-amber-400    border-amber-500/20',
  'bon':          'bg-emerald-500/10  text-emerald-400  border-emerald-500/20',
  'tres-fort':    'bg-emerald-500/15  text-emerald-300  border-emerald-500/30',
  'exceptionnel': 'bg-gradient-to-r from-emerald-500/25 to-teal-400/25 text-emerald-200 border-emerald-400/40',
}

export function engagementLabel(score: number): TEngagementLabel {
  if (score >= 85) return 'exceptionnel'
  if (score >= 65) return 'tres-fort'
  if (score >= 45) return 'bon'
  if (score >= 25) return 'moyen'
  return 'faible'
}

export type TEngagementInputs = {
  reach:    number
  saves:    number
  shares:   number
  comments: number
  likes:    number
  // Optional same-format baseline rates. When all four are present, the score
  // is computed relative to those rates (ratio capped at 2× → 100). Otherwise
  // it falls back to REFERENCE_RATES.
  baselineRates?: {
    saves:    number | null
    shares:   number | null
    comments: number | null
    likes:    number | null
  }
}

export type TEngagementResult = {
  score:          number              // 0–100
  label:          TEngagementLabel
  rates: {
    saves:    number
    shares:   number
    comments: number
    likes:    number
  }
  // Strongest signal (largest contribution to the score), used in summary
  // copy on the account health card and audience page.
  strongestSignal: 'saves' | 'shares' | 'comments' | 'likes' | null
  // True when reach is zero — caller should render a neutral state instead.
  hasReach:       boolean
}

function rate(value: number, reach: number): number {
  if (!Number.isFinite(reach) || reach <= 0) return 0
  return value / reach
}

// 0–100 contribution of a single rate against its reference. 1× reference
// scores 50 (neutral baseline), 2× reference scores 100 (capped).
function rateScore(actualRate: number, referenceRate: number): number {
  if (!Number.isFinite(referenceRate) || referenceRate <= 0) return 0
  const ratio = actualRate / referenceRate
  return Math.max(0, Math.min(1, ratio / 2)) * 100
}

/**
 * Compute the engagement score from a single post's metrics, or from
 * pre-aggregated account totals (saves/shares/comments/likes/reach summed
 * across the period). Rate-based — raw volumes don't bias the score in
 * favour of high-reach posts.
 */
export function computeEngagementScore(input: TEngagementInputs): TEngagementResult {
  const reach = input.reach
  const hasReach = reach > 0

  const rates = {
    saves:    rate(input.saves,    reach),
    shares:   rate(input.shares,   reach),
    comments: rate(input.comments, reach),
    likes:    rate(input.likes,    reach),
  }

  const refSaves    = pickRef(input.baselineRates?.saves,    REFERENCE_RATES.saves)
  const refShares   = pickRef(input.baselineRates?.shares,   REFERENCE_RATES.shares)
  const refComments = pickRef(input.baselineRates?.comments, REFERENCE_RATES.comments)
  const refLikes    = pickRef(input.baselineRates?.likes,    REFERENCE_RATES.likes)

  const partials = {
    saves:    rateScore(rates.saves,    refSaves),
    shares:   rateScore(rates.shares,   refShares),
    comments: rateScore(rates.comments, refComments),
    likes:    rateScore(rates.likes,    refLikes),
  }

  const score = hasReach
    ? Math.round(
        ENGAGEMENT_WEIGHTS.saves    * partials.saves    +
        ENGAGEMENT_WEIGHTS.shares   * partials.shares   +
        ENGAGEMENT_WEIGHTS.comments * partials.comments +
        ENGAGEMENT_WEIGHTS.likes    * partials.likes,
      )
    : 0

  // Strongest signal = weighted contribution to the final score, so a
  // reasonable saves rate beats a great-but-low-weight likes rate.
  const contributions: Array<['saves' | 'shares' | 'comments' | 'likes', number]> = [
    ['saves',    ENGAGEMENT_WEIGHTS.saves    * partials.saves   ],
    ['shares',   ENGAGEMENT_WEIGHTS.shares   * partials.shares  ],
    ['comments', ENGAGEMENT_WEIGHTS.comments * partials.comments],
    ['likes',    ENGAGEMENT_WEIGHTS.likes    * partials.likes   ],
  ]
  const strongest = hasReach
    ? contributions.reduce((acc, cur) => (cur[1] > acc[1] ? cur : acc))[0]
    : null

  return {
    score:           Math.max(0, Math.min(100, score)),
    label:           engagementLabel(score),
    rates,
    strongestSignal: strongest,
    hasReach,
  }
}

function pickRef(baseline: number | null | undefined, fallback: number): number {
  if (baseline == null) return fallback
  if (!Number.isFinite(baseline) || baseline <= 0) return fallback
  return baseline
}

export const ENGAGEMENT_SIGNAL_FR: Record<'saves' | 'shares' | 'comments' | 'likes', string> = {
  saves:    'sauvegardes',
  shares:   'partages',
  comments: 'commentaires',
  likes:    'likes',
}

/**
 * Short interpretation sentence for the account health card.
 * Honest about empty / weak states; doesn't over-promise.
 */
export function engagementInterpretation(result: TEngagementResult): string {
  if (!result.hasReach) {
    return 'Pas encore de reach mesurable sur la période sélectionnée.'
  }
  const signal = result.strongestSignal
    ? ENGAGEMENT_SIGNAL_FR[result.strongestSignal]
    : null
  switch (result.label) {
    case 'exceptionnel':
      return signal
        ? `Engagement exceptionnel — porté surtout par les ${signal}.`
        : 'Engagement exceptionnel sur la période.'
    case 'tres-fort':
      return signal
        ? `Très bon engagement — signal le plus fort : ${signal}.`
        : 'Très bon engagement sur la période.'
    case 'bon':
      return signal
        ? `Engagement solide — meilleur signal : ${signal}.`
        : 'Engagement solide sur la période.'
    case 'moyen':
      return signal
        ? `Engagement moyen — appui principal : ${signal}.`
        : 'Engagement moyen sur la période.'
    case 'faible':
      return 'Engagement faible — peu de réactions par rapport au reach.'
  }
}
