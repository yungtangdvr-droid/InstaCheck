import type { TPostScore, TBrandFitScore, TOpportunityHealth } from '@creator-hub/types'

// ─── Post performance score ───────────────────────────────────────────────────

const POST_WEIGHTS = {
  saves:         0.35,
  shares:        0.30,
  comments:      0.15,
  likes:         0.10,
  profileVisits: 0.10,
} as const

type PostMetrics = {
  saves: number
  shares: number
  comments: number
  likes: number
  profileVisits: number
}

type BaselineMetrics = PostMetrics

export function scorePost(metrics: PostMetrics, baseline: BaselineMetrics): TPostScore & { postId: string } {
  const normalize = (value: number, base: number) =>
    base === 0 ? 0 : Math.min(value / base, 2)

  const raw =
    POST_WEIGHTS.saves         * normalize(metrics.saves, baseline.saves) +
    POST_WEIGHTS.shares        * normalize(metrics.shares, baseline.shares) +
    POST_WEIGHTS.comments      * normalize(metrics.comments, baseline.comments) +
    POST_WEIGHTS.likes         * normalize(metrics.likes, baseline.likes) +
    POST_WEIGHTS.profileVisits * normalize(metrics.profileVisits, baseline.profileVisits)

  return {
    postId: '',
    score: Math.round(Math.min(raw, 1) * 100),
    baseline: 50,
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
    brandId: input.brandId,
    category: input.categoryMatch,
    aesthetic: input.aestheticProximity,
    budget: input.budgetPlausibility,
    contactExists: contactScore,
    recentSignals: input.recentSignals,
    total: Math.min(total, 100),
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

export function scoreOpportunityHealth(input: OpportunityHealthInput): TOpportunityHealth {
  let score = 50

  score -= input.daysSinceLastActivity
  if (input.deckOpened) score += 20
  if (input.replyReceived) score += 30
  score += Math.log10(Math.max(input.estimatedValue, 1)) * 2
  score += (input.probability - 50) * 0.3

  return {
    opportunityId: input.opportunityId,
    score: Math.max(0, Math.min(100, Math.round(score))),
    daysSinceActivity: input.daysSinceLastActivity,
    deckOpened: input.deckOpened,
    replyReceived: input.replyReceived,
  }
}
