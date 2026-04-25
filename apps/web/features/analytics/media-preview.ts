import type { Database } from '@creator-hub/types/supabase'

type RawJson = Database['public']['Tables']['raw_instagram_media']['Row']['raw_json']

/**
 * Safely read `thumbnail_url` and `media_url` out of the JSON blob stored by
 * the media sync in `raw_instagram_media.raw_json`. No OCR, no scraping — we
 * just hand the URLs Meta already returned on `/v21.0/{ig-user-id}/media`.
 *
 * Meta's CDN URLs are short-lived (signed). A preview that worked at sync
 * time may 403 a day later; callers must tolerate broken images rather than
 * treat these as stable references.
 *
 * For IMAGE / CAROUSEL_ALBUM, `media_url` is the image the user posted.
 * For VIDEO / REEL, `media_url` points to the video binary; the cover frame
 * lives in `thumbnail_url` and is what we want to render as an `<img>`.
 */
export function extractPreviewUrls(
  raw: RawJson | null,
  mediaId: string,
): { previewUrl: string | null; thumbnailUrl: string | null } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { previewUrl: null, thumbnailUrl: null }
  }
  const obj = raw as Record<string, unknown>
  const mediaType   = typeof obj.media_type     === 'string' ? obj.media_type     : null
  const mediaUrl    = typeof obj.media_url      === 'string' ? obj.media_url      : null
  const thumbnail   = typeof obj.thumbnail_url  === 'string' ? obj.thumbnail_url  : null

  void mediaId

  if (mediaType === 'VIDEO' || mediaType === 'REEL') {
    return { previewUrl: thumbnail ?? null, thumbnailUrl: thumbnail ?? null }
  }
  // IMAGE, CAROUSEL_ALBUM, and unknown types: prefer media_url, fall back to
  // thumbnail_url (older synced rows may only have one of the two).
  return {
    previewUrl:   mediaUrl  ?? thumbnail ?? null,
    thumbnailUrl: thumbnail ?? null,
  }
}
