// Recursive sanitizer for Meta Graph payloads and error bodies.
//
// PR 3 doctrine: an access token must never reach stdout, raw_json,
// metric_availability, error excerpts, or any other persisted /
// printed surface. This module is the single chokepoint used by:
//   - the probe layer (raw_response_excerpt)
//   - the persistence layer (raw_json on account daily + media)
//   - the persistence layer (errors[].body on benchmark_sync_runs)
//
// Two scrubbing rules:
//   1. Drop any object key whose name is `access_token` (case
//      insensitive), at any nesting depth.
//   2. Replace `access_token=<value>` substrings inside any string
//      with `access_token=REDACTED`, regardless of where the string
//      sits in the structure.

const ACCESS_TOKEN_KEY_RE  = /^access_token$/i
const ACCESS_TOKEN_QS_RE   = /access_token=[^&\s"'<>]*/gi

function scrubString(s: string): string {
  return s.replace(ACCESS_TOKEN_QS_RE, 'access_token=REDACTED')
}

export function scrubAccessToken(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return scrubString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(scrubAccessToken)
  if (typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(src)) {
      if (ACCESS_TOKEN_KEY_RE.test(k)) continue
      out[k] = scrubAccessToken(v)
    }
    return out
  }
  // Functions / symbols / bigint — never expected in JSON payloads
  // we handle. Coerce to string then scrub, to be safe.
  return scrubString(String(value))
}
