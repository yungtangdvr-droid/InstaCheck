// Just-in-time refresh of a single Meta media object.
//
// Background: `media_url` and `thumbnail_url` returned by the Instagram
// Graph API are signed CDN URLs that expire (no documented TTL, observed
// to fail within hours). The daily sync stores them inside
// `raw_instagram_media.raw_json` and never refreshes them between cron
// runs, so by the time Content Intelligence runs they are likely stale.
//
// This helper re-queries `/{media-id}?fields=media_url,thumbnail_url,media_type`
// for ONE media at a time, immediately before passing the URL to Gemini.
// No storage, no proxy. Per Meta's 200 req/h budget, a 5–100 post batch is
// trivially safe.

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

export type RefreshedMedia = {
  mediaId:      string
  mediaType:    string
  mediaUrl:     string | null
  thumbnailUrl: string | null
}

export type RefreshResult =
  | { ok: true;  data: RefreshedMedia }
  | { ok: false; error: string }

export async function refreshMediaUrl(
  mediaId:     string,
  accessToken: string,
): Promise<RefreshResult> {
  const url = new URL(`${GRAPH_BASE}/${mediaId}`)
  url.searchParams.set('fields', 'media_type,media_url,thumbnail_url')
  url.searchParams.set('access_token', accessToken)

  let res: Response
  try {
    res = await fetch(url.toString(), { cache: 'no-store' })
  } catch (err) {
    return { ok: false, error: `meta_fetch:${err instanceof Error ? err.message : 'unknown'}` }
  }

  if (!res.ok) {
    let body = ''
    try { body = await res.text() } catch { /* leave body empty */ }
    return { ok: false, error: formatMetaError(res.status, body) }
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, error: 'meta_parse' }
  }

  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'meta_shape' }
  }

  const obj = body as Record<string, unknown>
  return {
    ok: true,
    data: {
      mediaId,
      mediaType:    typeof obj.media_type     === 'string' ? obj.media_type     : 'UNKNOWN',
      mediaUrl:     typeof obj.media_url      === 'string' ? obj.media_url      : null,
      thumbnailUrl: typeof obj.thumbnail_url  === 'string' ? obj.thumbnail_url  : null,
    },
  }
}

// Cap the human-readable portion so the final `meta_<status>:<code>:<msg>`
// string fits comfortably under the 500-char `post_content_analysis.error_message`
// column (after `upsertSkipped` slices to 500). Status + code prefixes add ~20
// chars at most, leaving generous headroom.
const MAX_META_MESSAGE_LEN = 300

function redactToken(s: string): string {
  return s.replace(/access_token=[^&\s"']+/gi, 'access_token=REDACTED')
}

// Meta's documented 4xx/5xx body shape is `{ "error": { "message", "code",
// "error_subcode", "fbtrace_id", ... } }`. We extract code+message; anything
// off-spec falls back to a redacted body excerpt under `:unknown:`.
function formatMetaError(status: number, body: string): string {
  const trimmed = body.trim()
  if (trimmed.length === 0) {
    return `meta_${status}:unknown:`
  }

  let parsed: unknown = null
  try { parsed = JSON.parse(trimmed) } catch { /* not JSON */ }

  if (parsed !== null && typeof parsed === 'object') {
    const err = (parsed as { error?: unknown }).error
    if (err !== null && typeof err === 'object') {
      const e = err as Record<string, unknown>
      const codeRaw = e.code
      const code =
        typeof codeRaw === 'number' ? String(codeRaw) :
        typeof codeRaw === 'string' && codeRaw.length > 0 ? codeRaw :
        'unknown'
      const messageRaw = typeof e.message === 'string' ? e.message : ''
      const safeMessage = redactToken(messageRaw).slice(0, MAX_META_MESSAGE_LEN)
      return `meta_${status}:${code}:${safeMessage}`
    }
  }

  const excerpt = redactToken(trimmed).slice(0, MAX_META_MESSAGE_LEN)
  return `meta_${status}:unknown:${excerpt}`
}

/**
 * Pick the URL to send to Gemini.
 * - VIDEO / REEL: thumbnail (Meta does not return media_url for video without
 *   the thumbnail playback flow; thumbnail is the cover frame).
 * - IMAGE / CAROUSEL_ALBUM: media_url, fall back to thumbnail.
 */
export function pickAnalyzableUrl(media: RefreshedMedia): string | null {
  if (media.mediaType === 'VIDEO' || media.mediaType === 'REEL') {
    return media.thumbnailUrl ?? null
  }
  return media.mediaUrl ?? media.thumbnailUrl ?? null
}
