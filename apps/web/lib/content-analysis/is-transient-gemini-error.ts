// Classifies a Gemini failure reason as transient (worth retrying via the
// OpenAI fallback) or permanent (no point burning OpenAI quota — the same
// input would fail there too, or the failure is upstream of any provider).
//
// Allow-list — typical "Gemini is overloaded right now" surfaces:
//   503, 429, UNAVAILABLE, RESOURCE_EXHAUSTED, "high demand", "overloaded",
//   "rate limit", "quota", "deadline exceeded", "timeout", "fetch failed",
//   ECONNRESET / ETIMEDOUT.
//
// Deny-list (explicit, takes precedence over the allow-list):
//   - schema_validation:*    — Gemini already retried once internally; if
//                              both attempts produced bad JSON the prompt or
//                              vocab is the issue, not provider availability.
//   - media_fetch_*          — upstream Meta/CDN failure. OpenAI hits the
//                              same URL, fallback won't help.
//   - media_too_large_*      — permanent (>10 MiB cap).

const TRANSIENT_RE =
  /(\b503\b|\b429\b|unavailable|overloaded|high\s*demand|resource_exhausted|rate.?limit|quota|deadline.?exceeded|timeout|fetch\s*failed|ECONNRESET|ETIMEDOUT)/i

export function isTransientGeminiError(reason: string | null | undefined): boolean {
  if (!reason) return false
  if (reason.startsWith('schema_validation:')) return false
  if (reason.startsWith('media_fetch_'))       return false
  if (reason.startsWith('media_too_large_'))   return false
  return TRANSIENT_RE.test(reason)
}
