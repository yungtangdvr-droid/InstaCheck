// Meme Radar — RSS fetch + normalize.
//
// Wraps `rss-parser` so the ingest CLI deals with a stable, typed shape.
// Each item carries a deterministic `external_id`: the feed-provided guid
// when present, otherwise sha1(item.url). Items missing a title or url
// are dropped at parse time.

import Parser from 'rss-parser'

import { cleanSummary, sha1Hex } from './dedup'

export interface ParsedRadarItem {
  externalId:  string
  title:       string
  url:         string
  summary:     string | null
  publishedAt: string | null
  imageUrl:    string | null
  rawJson:     Record<string, unknown>
}

export interface FetchRssResult {
  items:       ParsedRadarItem[]
  feedTitle:   string | null
}

// rss-parser only copies a fixed set of fields onto its processed item;
// the namespaced media/itunes/image carriers we care about are not in
// the default list, so they need to be requested via customFields with
// keepArray:true. That preserves the xml2js shape (array of nodes,
// attributes under `$`) and lets pickImageUrl read them directly.
const parser: Parser = new Parser({
  timeout: 15_000,
  headers: { 'User-Agent': 'CreatorHub-MemeRadar/0.1 (+rss-ingest)' },
  customFields: {
    item: [
      ['media:content',   'media:content',   { keepArray: true }],
      ['media:thumbnail', 'media:thumbnail', { keepArray: true }],
      ['itunes:image',    'itunes:image',    { keepArray: true }],
      ['image',           'image',           { keepArray: true }],
    ],
  },
})

// Best-effort image URL extraction. Carriers in priority order:
//   1. enclosure.url (when type starts with image/ or is missing)
//   2. media:content (Media RSS — array of {$:{url,...}} or object/flat)
//   3. media:thumbnail (idem)
//   4. itunes:image (podcast — {$:{href}} or rss-parser's itunes.image string)
//   5. image (channel-level fallback — string, {url}, or {href})
// Keep this in lockstep with the SQL backfill in
// supabase/migrations/0013_meme_radar_image_url_backfill.sql.
function pickImageUrl(item: Parser.Item): string | null {
  const raw = item as unknown as Record<string, unknown>

  // 1. enclosure — rss-parser flattens to `{ url, type, length }`.
  const enclosure = raw.enclosure
  if (enclosure && typeof enclosure === 'object') {
    const enc = enclosure as { url?: unknown; type?: unknown }
    if (typeof enc.url === 'string' && enc.url.trim()) {
      const t = typeof enc.type === 'string' ? enc.type : ''
      if (!t || t.toLowerCase().startsWith('image/')) {
        const ok = safeUrl(enc.url)
        if (ok) return ok
      }
    }
  }

  // 2/3/4. namespaced nodes — accept array | object, attrs under `$`
  // or flattened, attribute name configurable (`url` vs `href`).
  const fromNode = (value: unknown, attr: 'url' | 'href' = 'url'): string | null => {
    if (value == null) return null
    const node = Array.isArray(value) ? value[0] : value
    if (!node || typeof node !== 'object') return null
    const obj = node as Record<string, unknown>
    const attrs = obj.$
    if (attrs && typeof attrs === 'object') {
      const v = (attrs as Record<string, unknown>)[attr]
      if (typeof v === 'string' && v.trim()) {
        const ok = safeUrl(v)
        if (ok) return ok
      }
    }
    const direct = obj[attr]
    if (typeof direct === 'string' && direct.trim()) {
      const ok = safeUrl(direct)
      if (ok) return ok
    }
    return null
  }

  const mediaContent = fromNode(raw['media:content'])
  if (mediaContent) return mediaContent

  // rss-parser also copies media:content's first element attrs to
  // `mediaContent` (flat object). Use it as a fallback for legacy
  // rows ingested before customFields was wired up.
  const mappedMedia = raw.mediaContent
  if (mappedMedia && typeof mappedMedia === 'object') {
    const v = (mappedMedia as Record<string, unknown>).url
    if (typeof v === 'string' && v.trim()) {
      const ok = safeUrl(v)
      if (ok) return ok
    }
  }

  const mediaThumb = fromNode(raw['media:thumbnail'])
  if (mediaThumb) return mediaThumb

  const itunesImage = fromNode(raw['itunes:image'], 'href')
  if (itunesImage) return itunesImage

  // rss-parser's podcastItem mapping flattens itunes:image's href to
  // `itunes.image` as a string.
  const itunes = raw.itunes
  if (itunes && typeof itunes === 'object') {
    const v = (itunes as Record<string, unknown>).image
    if (typeof v === 'string' && v.trim()) {
      const ok = safeUrl(v)
      if (ok) return ok
    }
  }

  // 5. image — string, { url }, or { href }. Some feeds also wrap in array.
  const image = Array.isArray(raw.image) ? raw.image[0] : raw.image
  if (typeof image === 'string' && image.trim()) {
    const ok = safeUrl(image)
    if (ok) return ok
  }
  if (image && typeof image === 'object') {
    const obj = image as Record<string, unknown>
    if (typeof obj.url === 'string' && obj.url.trim()) {
      const ok = safeUrl(obj.url)
      if (ok) return ok
    }
    if (typeof obj.href === 'string' && obj.href.trim()) {
      const ok = safeUrl(obj.href)
      if (ok) return ok
    }
  }

  return null
}

function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

function pickPublishedAt(item: Parser.Item): string | null {
  const raw = item.isoDate ?? item.pubDate ?? null
  if (!raw) return null
  const t = Date.parse(raw)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

function pickExternalId(item: Parser.Item): string | null {
  const guid = (item.guid ?? '').trim()
  if (guid) return guid
  const link = (item.link ?? '').trim()
  if (link) return sha1Hex(link)
  return null
}

export async function fetchRss(feedUrl: string): Promise<FetchRssResult> {
  const feed = await parser.parseURL(feedUrl)
  const items: ParsedRadarItem[] = []
  for (const it of feed.items ?? []) {
    const title = (it.title ?? '').trim()
    const url   = (it.link  ?? '').trim()
    if (!title || !url) continue

    const externalId = pickExternalId(it)
    if (!externalId) continue

    const summarySrc = it.contentSnippet ?? it.content ?? it.summary ?? null
    items.push({
      externalId,
      title,
      url,
      summary:     cleanSummary(summarySrc),
      publishedAt: pickPublishedAt(it),
      imageUrl:    pickImageUrl(it),
      rawJson:     it as unknown as Record<string, unknown>,
    })
  }
  return { items, feedTitle: feed.title ?? null }
}
