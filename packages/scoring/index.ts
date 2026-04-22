import type {
  TPostScore,
  TBrandFitScore,
  TOpportunityHealthScore,
} from '@creator-hub/types'

// ─── Post performance score ───────────────────────────────────────────────────

// Canonical weights for post performance scoring. Single source of truth —
// imported by analytics aggregations and content-lab recommendations.
export const POST_SCORE_WEIGHTS = {
  saves:         0.35,
  shares:        0.30,
  comments:      0.15,
  likes:         0.10,
  profileVisits: 0.10,
} as const

export type TPostMetrics = {
  saves: number
  shares: number
  comments: number
  likes: number
  profileVisits: number
}

type BaselineMetrics = TPostMetrics

export function scorePost(metrics: TPostMetrics, baseline: BaselineMetrics): TPostScore {
  const normalize = (value: number, base: number) =>
    base === 0 ? 0 : Math.min(value / base, 2)

  const raw =
    POST_SCORE_WEIGHTS.saves         * normalize(metrics.saves,         baseline.saves) +
    POST_SCORE_WEIGHTS.shares        * normalize(metrics.shares,        baseline.shares) +
    POST_SCORE_WEIGHTS.comments      * normalize(metrics.comments,      baseline.comments) +
    POST_SCORE_WEIGHTS.likes         * normalize(metrics.likes,         baseline.likes) +
    POST_SCORE_WEIGHTS.profileVisits * normalize(metrics.profileVisits, baseline.profileVisits)

  const baselineValue = 50
  const score = Math.round(Math.min(raw, 1) * 100)

  return {
    postId:   '',
    score,
    baseline: baselineValue,
    delta:    score - baselineValue,
  }
}

// ─── Brand fit score ──────────────────────────────────────────────────────────

type BrandFitInput = {
  brandId: string
  categoryMatch: number      // 0-20
  aestheticProximity: number // 0-20
  budgetPlausibility: number // 0-20
  hasContact: boolean
  recentSignals: number      // 0-20 (nombre de signaux détectés × 4, max 20)
}

export function scoreBrandFit(input: BrandFitInput): TBrandFitScore {
  const contactScore = input.hasContact ? 20 : 0
  const total =
    input.categoryMatch +
    input.aestheticProximity +
    input.budgetPlausibility +
    contactScore +
    input.recentSignals

  return {
    brandId:        input.brandId,
    categoryScore:  input.categoryMatch,
    aestheticScore: input.aestheticProximity,
    budgetScore:    input.budgetPlausibility,
    contactScore,
    signalScore:    input.recentSignals,
    total:          Math.min(total, 100),
  }
}

// ─── Opportunity health score ─────────────────────────────────────────────────

type OpportunityHealthInput = {
  opportunityId: string
  daysSinceLastActivity: number
  deckOpened: boolean
  replyReceived: boolean
  estimatedValue: number
  probability: number
}

export function scoreOpportunityHealth(input: OpportunityHealthInput): TOpportunityHealthScore {
  const recencyPenalty = -input.daysSinceLastActivity
  const deckBonus      = input.deckOpened   ? 20 : 0
  const replyBonus     = input.replyReceived ? 30 : 0
  const valueScore     = Math.log10(Math.max(input.estimatedValue, 1)) * 2
  const probabilityAdj = (input.probability - 50) * 0.3

  const raw   = 50 + recencyPenalty + deckBonus + replyBonus + valueScore + probabilityAdj
  const total = Math.max(0, Math.min(100, Math.round(raw)))

  return {
    opportunityId: input.opportunityId,
    recencyPenalty,
    deckBonus,
    replyBonus,
    valueScore,
    probability:   input.probability,
    total,
  }
}
