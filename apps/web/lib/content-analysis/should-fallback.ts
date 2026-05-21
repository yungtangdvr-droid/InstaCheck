// Decides whether a provider failure in the Content Intelligence chain
// should fall through to the next provider, or be returned as-is.
//
// Rule (broader than `isTransientGeminiError`, which stays narrow for the
// radar path): try the next provider on anything EXCEPT permanent media
// errors. Both classes below describe upstream Meta/CDN problems with
// the source URL itself — the next provider hits the exact same URL, so
// retrying there cannot help.
//
// Fall-through (return true):
//   - HTTP errors           (`*_http_429`, `*_http_500`, …)
//   - rate-limit / quota    (`*_resource_exhausted`, `*_quota_*`)
//   - timeouts              (`*_timeout`, `AbortError: …`)
//   - empty / invalid JSON  (`*_empty_content`, `*_invalid_json`, `*_parse:*`)
//   - schema validation     (`schema_validation:*`) — Gemini may produce
//     bad JSON on a meme that OpenAI/Mistral classifies cleanly. The old
//     narrow rule denied this and is exactly why operators saw schema
//     errors stick instead of recovering.
//   - fetch / network       (`*_fetch:*`, `ECONNRESET`, `ETIMEDOUT`)
//
// Stop the chain (return false):
//   - `media_fetch_*`       — Meta/CDN refused or 404'd the URL.
//   - `media_too_large_*`   — >10 MiB cap; the cap is identical across
//                             providers.

const PERMANENT_MEDIA_RE = /^media_(fetch_|too_large_)/

export function shouldFallbackProvider(error: string | null | undefined): boolean {
  if (!error) return false
  if (PERMANENT_MEDIA_RE.test(error)) return false
  return true
}
