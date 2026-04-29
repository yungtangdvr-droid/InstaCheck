// Engagement Score v2 — "Score circulation" — optimised for a meme creator
// account where shareability and DM circulation drive distribution. Surfaces
// share at /analytics, /audience, post detail, PostExplorer.
//
// Distinct from the percentile rank in `ranking.ts`:
//   - rank.ts answers "where does this post sit vs same-format 30 d baseline"
//     (distribution-relative, percentile within the loaded set).
//   - this module answers "how strongly does this post circulate" using
//     rate-based signals normalised against a same-format baseline (with a
//     log-scaled ratio so a few outliers don't saturate the scale).
//
// Weight rationale (meme account):
//   - shares  → primary distribution signal (DM forwards, story re-posts)
//   - saves   → secondary value/memory signal
//   - comments / likes → soft confirms, deliberately capped to avoid
//                        comment-bait dominating the score
//   - profile_visits → small bonus when the metric is available
//
// Backwards-compatible aliases (computeEngagementScore, ENGAGEMENT_LABEL_*,
// engagementInterpretation) are kept at the bottom of this file so older
// imports still resolve while we migrate the UI to the "circulation" wording.

export type TDistributionSignal =
  | 'shares'
  | 'saves'
  | 'comments'
  | 'likes'
  | 'profileVisits'

export const DISTRIBUTION_WEIGHTS: Record<TDistributionSignal, number> = {
  shares:        0.50,
  saves:         0.25,
  comments:      0.10,
  likes:         0.10,
  profileVisits: 0.05,
}

// Final-fallback rates used when no caller-supplied baseline is available.
// Conservative meme-account heuristics — kept low enough that a real strong
// post still scores well, kept high enough that a flat post doesn't bloat to
// "Bon" by accident.
const FALLBACK_RATES: Record<TDistributionSignal, number> = {
  shares:        0.020,
  saves:         0.030,
  comments:      0.005,
  likes:         0.060,
  profileVisits: 0.005,
}

// Log-scaled normalisation anchor. ratio == 1 → ~0.46, ratio == 2 → ~0.68,
// ratio == 4 → 1.0 (cap). Above 4× the curve flattens, so 20× baseline does
// not destroy the scale or steal the dominant-signal slot from a real-world
// healthy post.
const LOG_ANCHOR = Math.log(1 + 4)

export type TDistributionLabel =
  | 'faible'
  | 'moyen'
  | 'bon'
  | 'tres-fort'
  | 'exceptionnel'

// Self-relative labels — the displayed text describes the score's position vs
// the operator's own baseline, never an absolute market judgment. Every UI
// surface that renders these MUST also render a baseline qualifier (e.g.
// "vs ta baseline 90j") in close visual proximity.
//
// Union keys (faible/moyen/bon/tres-fort/exceptionnel) and the threshold
// boundaries in distributionLabel() are intentionally left unchanged — only
// the user-facing French text is rewritten.
export const DISTRIBUTION_LABEL_FR: Record<TDistributionLabel, string> = {
  'faible':       'Très sous ta baseline',
  'moyen':        'Sous ta baseline',
  'bon':          'Dans ta zone normale',
  'tres-fort':    'Au-dessus de ta baseline',
  'exceptionnel': 'Très au-dessus de ta baseline',
}

// Strategic, copy-ready descriptions used in the account health interpretation
// and the post-detail card. Phrased as self-relative observations only — never
// "weak / strong / exceptional". The UI joins them with the dominant signal
// sentence and a baseline qualifier.
export const DISTRIBUTION_LABEL_COPY: Record<TDistributionLabel, string> = {
  'exceptionnel': 'tes posts circulent très au-dessus de ton historique',
  'tres-fort':    'tes posts circulent au-dessus de ton historique',
  'bon':          'tes posts circulent dans ta zone habituelle',
  'moyen':        'tes posts circulent en-dessous de ton historique',
  'faible':       'tes posts circulent nettement moins que ton historique',
}

export const DISTRIBUTION_LABEL_CLASS: Record<TDistributionLabel, string> = {
  'faible':       'bg-danger-soft  text-danger  border-danger/30',
  'moyen':        'bg-warning-soft text-warning border-warning/30',
  'bon':          'bg-success-soft text-success border-success/30',
  'tres-fort':    'bg-success-soft text-success border-success/40',
  'exceptionnel': 'bg-success-soft text-success border-success/50',
}

export const DISTRIBUTION_SIGNAL_FR: Record<TDistributionSignal, string> = {
  shares:        'partages',
  saves:         'sauvegardes',
  comments:      'commentaires',
  likes:         'likes',
  profileVisits: 'visites de profil',
}

export function distributionLabel(score: number): TDistributionLabel {
  if (score >= 85) return 'exceptionnel'
  if (score >= 65) return 'tres-fort'
  if (score >= 45) return 'bon'
  if (score >= 25) return 'moyen'
  return 'faible'
}

export type TDistributionInput = {
  reach:    number
  shares:   number
  saves:    number
  comments: number
  likes:    number
  // Undefined / null when the metric is not exposed for this media type.
  // When null the profile_visits weight is redistributed onto shares + saves.
  profileVisits?: number | null
  // Optional per-metric baseline rates (already divided by reach). Each may be
  // null/undefined — the function falls back to FALLBACK_RATES per metric.
  baselineRates?: Partial<Record<TDistributionSignal, number | null | undefined>>
}

export type TDistributionResult = {
  score:           number              // 0–100
  label:           TDistributionLabel
  rates:           Record<TDistributionSignal, number | null>
  // metric rate / baseline rate (null when rate is not measurable).
  ratios:          Record<TDistributionSignal, number | null>
  // log-scaled normalised contribution per metric, in [0, 1].
  normalized:      Record<TDistributionSignal, number | null>
  // Effective weights actually applied (profileVisits redistributed when null).
  weights:         Record<TDistributionSignal, number>
  // Largest weighted contribution. Null when reach is zero.
  dominantSignal:  TDistributionSignal | null
  hasReach:        boolean
  hasProfileVisits: boolean
}

function logScale(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0
  return Math.max(0, Math.min(1, Math.log(1 + ratio) / LOG_ANCHOR))
}

function pickBaselineRate(
  custom: number | null | undefined,
  fallback: number,
): number {
  if (custom == null) return fallback
  if (!Number.isFinite(custom) || custom <= 0) return fallback
  return custom
}

function rateOf(value: number, reach: number): number | null {
  if (reach <= 0) return null
  return value / reach
}

function rateRatio(rate: number | null, baselineRate: number): number | null {
  if (rate == null) return null
  if (baselineRate <= 0) return null
  return rate / baselineRate
}

// profile_visits weight (5 %) is redistributed proportionally to shares (50 %)
// and saves (25 %) when the metric is unavailable for the media type.
function effectiveWeights(hasProfileVisits: boolean): Record<TDistributionSignal, number> {
  if (hasProfileVisits) return { ...DISTRIBUTION_WEIGHTS }
  const shareSlice = DISTRIBUTION_WEIGHTS.shares /
                     (DISTRIBUTION_WEIGHTS.shares + DISTRIBUTION_WEIGHTS.saves)
  const saveSlice  = DISTRIBUTION_WEIGHTS.saves /
                     (DISTRIBUTION_WEIGHTS.shares + DISTRIBUTION_WEIGHTS.saves)
  return {
    shares:        DISTRIBUTION_WEIGHTS.shares + DISTRIBUTION_WEIGHTS.profileVisits * shareSlice,
    saves:         DISTRIBUTION_WEIGHTS.saves  + DISTRIBUTION_WEIGHTS.profileVisits * saveSlice,
    comments:      DISTRIBUTION_WEIGHTS.comments,
    likes:         DISTRIBUTION_WEIGHTS.likes,
    profileVisits: 0,
  }
}

/**
 * Compute the distribution (circulation) score for a single post or for an
 * aggregate of posts (when the caller passes summed totals). Rate-based —
 * raw volumes never bias the score in favour of high-reach posts.
 */
export function computeDistributionScore(input: TDistributionInput): TDistributionResult {
  const reach = input.reach
  const hasReach = reach > 0
  const hasProfileVisits = input.profileVisits != null

  const rates: Record<TDistributionSignal, number | null> = {
    shares:        rateOf(input.shares,                     reach),
    saves:         rateOf(input.saves,                      reach),
    comments:      rateOf(input.comments,                   reach),
    likes:         rateOf(input.likes,                      reach),
    profileVisits: hasProfileVisits ? rateOf(input.profileVisits ?? 0, reach) : null,
  }

  const baselineRates: Record<TDistributionSignal, number> = {
    shares:        pickBaselineRate(input.baselineRates?.shares,        FALLBACK_RATES.shares),
    saves:         pickBaselineRate(input.baselineRates?.saves,         FALLBACK_RATES.saves),
    comments:      pickBaselineRate(input.baselineRates?.comments,      FALLBACK_RATES.comments),
    likes:         pickBaselineRate(input.baselineRates?.likes,         FALLBACK_RATES.likes),
    profileVisits: pickBaselineRate(input.baselineRates?.profileVisits, FALLBACK_RATES.profileVisits),
  }

  const ratios: Record<TDistributionSignal, number | null> = {
    shares:        rateRatio(rates.shares,        baselineRates.shares),
    saves:         rateRatio(rates.saves,         baselineRates.saves),
    comments:      rateRatio(rates.comments,      baselineRates.comments),
    likes:         rateRatio(rates.likes,         baselineRates.likes),
    profileVisits: rateRatio(rates.profileVisits, baselineRates.profileVisits),
  }

  const normalized: Record<TDistributionSignal, number | null> = {
    shares:        ratios.shares        != null ? logScale(ratios.shares)        : null,
    saves:         ratios.saves         != null ? logScale(ratios.saves)         : null,
    comments:      ratios.comments      != null ? logScale(ratios.comments)      : null,
    likes:         ratios.likes         != null ? logScale(ratios.likes)         : null,
    profileVisits: ratios.profileVisits != null ? logScale(ratios.profileVisits) : null,
  }

  const weights = effectiveWeights(hasProfileVisits)

  let weightedSum = 0
  let weightTotal = 0
  for (const key of Object.keys(weights) as TDistributionSignal[]) {
    const w = weights[key]
    if (w === 0) continue
    const n = normalized[key]
    if (n == null) continue
    weightedSum += w * n
    weightTotal += w
  }

  const score = hasReach && weightTotal > 0
    ? Math.round((weightedSum / weightTotal) * 100)
    : 0

  // Dominant signal = largest weighted contribution. Profile visits can win
  // only when actually available (weight non-zero AND normalized non-null).
  let dominantSignal: TDistributionSignal | null = null
  if (hasReach) {
    let bestContribution = 0
    for (const key of Object.keys(weights) as TDistributionSignal[]) {
      const contribution = (weights[key] || 0) * (normalized[key] ?? 0)
      if (contribution > bestContribution) {
        bestContribution = contribution
        dominantSignal = key
      }
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    label: distributionLabel(score),
    rates,
    ratios,
    normalized,
    weights,
    dominantSignal,
    hasReach,
    hasProfileVisits,
  }
}

/**
 * Strategic copy for the account health card and post detail block.
 * Self-relative — the sentence describes the score against the operator's
 * own baseline, never absolute. Pass `baselineQualifier` (e.g.
 * "vs ta baseline 90j") so the head reads unambiguously.
 *
 * Example output:
 *   "Au-dessus de ta baseline (vs ta baseline 30j) — tes posts circulent
 *    au-dessus de ton historique. Signal dominant : partages."
 */
export function distributionInterpretation(
  result: TDistributionResult,
  baselineQualifier?: string,
): string {
  if (!result.hasReach) {
    return 'Pas encore de reach mesurable sur la période sélectionnée.'
  }
  const labelText = baselineQualifier
    ? `${DISTRIBUTION_LABEL_FR[result.label]} (${baselineQualifier})`
    : DISTRIBUTION_LABEL_FR[result.label]
  const head = `${labelText} — ${DISTRIBUTION_LABEL_COPY[result.label]}.`
  if (result.dominantSignal) {
    return `${head} Signal dominant : ${DISTRIBUTION_SIGNAL_FR[result.dominantSignal]}.`
  }
  return head
}

// ---------------------------------------------------------------------------
// Baseline helpers — shared by health, post explorer, post detail.
// ---------------------------------------------------------------------------

export type TBaselineMartRow = {
  total_reach:              number | null
  total_saves:              number | null
  total_shares:             number | null
  total_likes:              number | null
  total_comments:           number | null
  total_profile_visits:     number | null
  media_type?:              string | null
  baseline_saves?:          number | string | null
  baseline_shares?:         number | string | null
  baseline_comments?:       number | string | null
  baseline_likes?:          number | string | null
  baseline_profile_visits?: number | string | null
}

export type TFormatRateMedians = Map<string, Partial<Record<TDistributionSignal, number>>>

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/**
 * Per-format median *rate* table built from a set of mart rows. Used as the
 * second-tier fallback (after the dbt mart per-post baseline, before the
 * conservative defaults) when scoring a post against its same-format peers.
 * Storing the median (not the average) keeps a single outlier from dragging
 * the baseline.
 */
export function computeFormatRateMedians(rows: TBaselineMartRow[]): TFormatRateMedians {
  const groups = new Map<string, {
    shares: number[]; saves: number[]; comments: number[]; likes: number[]; profileVisits: number[]
  }>()
  for (const row of rows) {
    const reach = Number(row.total_reach ?? 0)
    if (reach <= 0) continue
    const mt = row.media_type ?? 'UNKNOWN'
    const bucket = groups.get(mt) ?? { shares: [], saves: [], comments: [], likes: [], profileVisits: [] }
    bucket.shares  .push(Number(row.total_shares    ?? 0) / reach)
    bucket.saves   .push(Number(row.total_saves     ?? 0) / reach)
    bucket.comments.push(Number(row.total_comments  ?? 0) / reach)
    bucket.likes   .push(Number(row.total_likes     ?? 0) / reach)
    if (row.total_profile_visits != null) {
      bucket.profileVisits.push(Number(row.total_profile_visits) / reach)
    }
    groups.set(mt, bucket)
  }
  const out: TFormatRateMedians = new Map()
  for (const [mt, b] of groups.entries()) {
    out.set(mt, {
      shares:        median(b.shares),
      saves:         median(b.saves),
      comments:      median(b.comments),
      likes:         median(b.likes),
      profileVisits: b.profileVisits.length > 0 ? median(b.profileVisits) : undefined,
    })
  }
  return out
}

/**
 * Build the per-post baseline rate table by preferring the dbt mart's
 * per-format baseline (baseline_metric / post_reach approximation), then
 * falling back to the period-wide median rate for the same format. The
 * scoring function applies its own conservative final fallback when both
 * are missing.
 */
export function baselineRatesForPost(
  row: TBaselineMartRow,
  medians: TFormatRateMedians,
): Partial<Record<TDistributionSignal, number | null>> {
  const reach = Number(row.total_reach ?? 0)
  const mt = row.media_type ?? 'UNKNOWN'
  const fallback = medians.get(mt) ?? {}
  const fromBaseline = (raw: number | string | null | undefined): number | null => {
    if (raw == null) return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return null
    if (reach <= 0) return null
    return n / reach
  }
  return {
    shares:        fromBaseline(row.baseline_shares)         ?? fallback.shares        ?? null,
    saves:         fromBaseline(row.baseline_saves)          ?? fallback.saves         ?? null,
    comments:      fromBaseline(row.baseline_comments)       ?? fallback.comments      ?? null,
    likes:         fromBaseline(row.baseline_likes)          ?? fallback.likes         ?? null,
    profileVisits: fromBaseline(row.baseline_profile_visits) ?? fallback.profileVisits ?? null,
  }
}

// ---------------------------------------------------------------------------
// Backwards-compat aliases — keep older imports compiling until every call
// site is migrated. Names map 1:1 to the v2 surface above. These do not add
// new behaviour; they are pure re-exports so the v2 algorithm is the single
// source of truth.
// ---------------------------------------------------------------------------

export type TEngagementLabel  = TDistributionLabel
export type TEngagementSignal = TDistributionSignal
export type TEngagementResult = TDistributionResult

export const ENGAGEMENT_LABEL_FR    = DISTRIBUTION_LABEL_FR
export const ENGAGEMENT_LABEL_CLASS = DISTRIBUTION_LABEL_CLASS
export const ENGAGEMENT_SIGNAL_FR   = DISTRIBUTION_SIGNAL_FR
export const ENGAGEMENT_WEIGHTS     = DISTRIBUTION_WEIGHTS

export const engagementLabel          = distributionLabel
export const engagementInterpretation = distributionInterpretation
export const computeEngagementScore   = computeDistributionScore

export type TEngagementInputs = TDistributionInput
