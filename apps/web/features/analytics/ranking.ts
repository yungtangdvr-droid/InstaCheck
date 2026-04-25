// UI-side ranking / percentile for posts within the currently selected period.
//
// The dbt mart (`mart_post_performance.performance_score`) is baseline-relative
// and clamped 0–100 around 50. On this account most posts saturate at ~100,
// which makes the absolute score non-discriminating. This module instead
// derives an *unclamped* weighted ratio vs the same-format 30 d baseline
// (saves / shares / comments / likes / profile_visits), and ranks posts by
// percentile within the currently-loaded set.
//
// Weights mirror the Meta-facing scoring config (MASTER_PROMPT_CREATOR_HUB.md
// § Logique de scoring / Post performance score). This is intentional so the
// UI signal stays aligned with the dbt scoring even though the transform is
// different (no clamp, no 0–100 rescale).

export type TRankInputs = {
  saves:                 number
  shares:                number
  comments:              number
  likes:                 number
  profileVisits:         number
  baselineSaves:         number | null
  baselineShares:        number | null
  baselineComments:      number | null
  baselineLikes:         number | null
  baselineProfileVisits: number | null
}

const RANK_WEIGHTS = {
  saves:         0.35,
  shares:        0.30,
  comments:      0.15,
  likes:         0.10,
  profileVisits: 0.10,
} as const

function ratio(actual: number, baseline: number | null): number | null {
  if (baseline == null) return null
  if (!Number.isFinite(baseline) || baseline <= 0) return null
  return actual / baseline
}

/**
 * Weighted sum of per-metric ratios vs the 30 d same-format baseline.
 * Unbounded: 1.0 matches baseline, 3.0 is 3× baseline. Null when every
 * baseline is missing or zero. If only some baselines are present, the
 * existing weights are renormalized so the result stays comparable.
 */
export function computeRankScore(r: TRankInputs): number | null {
  const parts: Array<{ weight: number; ratio: number }> = []
  const rSaves    = ratio(r.saves,         r.baselineSaves)
  const rShares   = ratio(r.shares,        r.baselineShares)
  const rComm     = ratio(r.comments,      r.baselineComments)
  const rLikes    = ratio(r.likes,         r.baselineLikes)
  const rProfile  = ratio(r.profileVisits, r.baselineProfileVisits)

  if (rSaves   != null) parts.push({ weight: RANK_WEIGHTS.saves,         ratio: rSaves   })
  if (rShares  != null) parts.push({ weight: RANK_WEIGHTS.shares,        ratio: rShares  })
  if (rComm    != null) parts.push({ weight: RANK_WEIGHTS.comments,      ratio: rComm    })
  if (rLikes   != null) parts.push({ weight: RANK_WEIGHTS.likes,         ratio: rLikes   })
  if (rProfile != null) parts.push({ weight: RANK_WEIGHTS.profileVisits, ratio: rProfile })

  if (parts.length === 0) return null
  const wsum     = parts.reduce((s, p) => s + p.weight,           0)
  const weighted = parts.reduce((s, p) => s + p.weight * p.ratio, 0)
  return weighted / wsum
}

/**
 * Percentile rank (0–100) within the set. Uses the midrank convention
 * ((strictly_less + equal/2) / n) so ties share a single percentile.
 * Rows with a null rankScore keep a null percentile and are not counted
 * in the denominator.
 */
export function computePercentiles<T extends { rankScore: number | null }>(
  rows: T[],
): Array<T & { percentile: number | null }> {
  const scores = rows
    .map(r => r.rankScore)
    .filter((s): s is number => s != null)
  const n = scores.length
  if (n === 0) return rows.map(r => ({ ...r, percentile: null }))

  return rows.map(r => {
    const s = r.rankScore
    if (s == null) return { ...r, percentile: null }
    let less  = 0
    let equal = 0
    for (const v of scores) {
      if (v <  s) less++
      else if (v === s) equal++
    }
    const pct = Math.round(((less + equal / 2) / n) * 100)
    return { ...r, percentile: pct }
  })
}

export type TRankLabel =
  | 'top-5'
  | 'top-10'
  | 'top-25'
  | 'above-avg'
  | 'avg'
  | 'under'

// Labels require enough posts in the set for percentiles to mean anything.
// Under this threshold the UI shows a neutral "Échantillon faible" state
// instead of a rank band.
const RANK_MIN_SAMPLE = 5

export function rankLabel(
  percentile: number | null,
  sampleSize: number,
): TRankLabel | null {
  if (percentile == null) return null
  if (sampleSize < RANK_MIN_SAMPLE) return null
  if (percentile >= 95) return 'top-5'
  if (percentile >= 90) return 'top-10'
  if (percentile >= 75) return 'top-25'
  if (percentile >= 55) return 'above-avg'
  if (percentile >= 35) return 'avg'
  return 'under'
}

export const RANK_LABEL_FR: Record<TRankLabel, string> = {
  'top-5':     'Top 5%',
  'top-10':    'Top 10%',
  'top-25':    'Top 25%',
  'above-avg': 'Au-dessus de la moyenne',
  'avg':       'Moyen',
  'under':     'Sous-performance',
}

// Tailwind class helpers for the rank badge. Kept in sync with the emerald /
// neutral / red scale used elsewhere in the analytics views (PostExplorer,
// DeltaBadge, MultiplierTile).
export const RANK_LABEL_CLASS: Record<TRankLabel, string> = {
  'top-5':     'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'top-10':    'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  'top-25':    'bg-emerald-500/10 text-emerald-400 border-emerald-500/15',
  'above-avg': 'bg-neutral-800    text-neutral-200 border-neutral-700',
  'avg':       'bg-neutral-800/60 text-neutral-400 border-neutral-800',
  'under':     'bg-red-500/15     text-red-400     border-red-500/20',
}

export const RANK_MIN_SAMPLE_FOR_LABEL = RANK_MIN_SAMPLE
