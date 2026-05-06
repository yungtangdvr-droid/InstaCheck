// Compact, machine identifiers for the SQL → TS handoff. Never rendered in
// the UI: the operator sees the French sentence produced by build-reason.ts.
// Adding a new code requires: (1) a SELECT branch in
// v_post_intelligence_candidates, (2) a builder in REASON_BUILDERS.
export type TReasonCode =
  | 'recent_strong_performer'
  | 'era_format_match'
  | 'recent_underperform'

export const REASON_CODES: readonly TReasonCode[] = [
  'recent_strong_performer',
  'era_format_match',
  'recent_underperform',
] as const

export function isReasonCode(value: unknown): value is TReasonCode {
  return typeof value === 'string' && (REASON_CODES as readonly string[]).includes(value)
}
