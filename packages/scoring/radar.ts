// Meme Radar — composite scoring helper.
//
// Single source of truth for the weights used to collapse the five
// AI-produced sub-scores into one operator-facing 0–100 number. The
// composite is computed in TypeScript and never asked of the model:
// the LLM only returns the five sub-scores.
//
// Imported by the radar scoring CLI/batch and (later) any UI surface
// that needs to display or re-rank the same composite.

export const RADAR_SCORE_WEIGHTS = {
  memePotential:     0.30,
  yugnatFit:         0.30,
  timingUrgency:     0.15,
  visualPotential:   0.10,
  culturalRelevance: 0.15,
} as const

export type TRadarSubScores = {
  memePotential:     number
  yugnatFit:         number
  timingUrgency:     number
  visualPotential:   number
  culturalRelevance: number
}

const clamp01_100 = (n: number): number => {
  if (!Number.isFinite(n)) return 0
  if (n < 0)   return 0
  if (n > 100) return 100
  return n
}

export function radarComposite(input: TRadarSubScores): number {
  const raw =
    RADAR_SCORE_WEIGHTS.memePotential     * clamp01_100(input.memePotential)     +
    RADAR_SCORE_WEIGHTS.yugnatFit         * clamp01_100(input.yugnatFit)         +
    RADAR_SCORE_WEIGHTS.timingUrgency     * clamp01_100(input.timingUrgency)     +
    RADAR_SCORE_WEIGHTS.visualPotential   * clamp01_100(input.visualPotential)   +
    RADAR_SCORE_WEIGHTS.culturalRelevance * clamp01_100(input.culturalRelevance)
  return Math.round(raw)
}
