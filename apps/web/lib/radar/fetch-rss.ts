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

const parser: Parser = new Parser({
  timeout: 15_000,
  headers: { 'User-Agent': 'CreatorHub-MemeRadar/0.1 (+rss-ingest)' },
})

// Best-effort image URL extraction. Carriers in priority order:
//   1. enclosure.url (when type starts with image/ or is missing)
//   2. media:content[].$.url    (RSS Media namespace, single or array)
//   3. media:thumbnail[].$.url  (idem)
//   4. itunes:image.$.href      (podcast namespace, sometimes reused)
//   5. image.url                (legacy item-level image)
// Keep this in lockstep with the SQL backfill in
// supabase/migrations/0012_meme_radar_quality_loop.sql.
function pickImageUrl(item: Parser.Item): string | null {
  const raw = item as unknown as Record<string, unknown>

  const enclosure = raw.enclosure as { url?: unknown; type?: unknown } | undefined
  if (enclosure && typeof enclosure.url === 'string' && enclosure.url.trim()) {
    const t = typeof enclosure.type === 'string' ? enclosure.type : ''
    if (!t || t.toLowerCase().startsWith('image/')) {
      const ok = safeUrl(enclosure.url)
      if (ok) return ok
    }
  }

  const fromMediaArray = (value: unknown): string | null => {
    const node = Array.isArray(value) ? value[0] : value
    if (!node || typeof node !== 'object') return null
    const attrs = (node as { $?: unknown }).$
    if (attrs && typeof attrs === 'object') {
      const url = (attrs as { url?: unknown }).url
      if (typeof url === 'string' && url.trim()) return safeUrl(url)
    }
    const direct = (node as { url?: unknown }).url
    if (typeof direct === 'string' && direct.trim()) return safeUrl(direct)
    return null
  }

  const mediaContent = fromMediaArray(raw['media:content'])
  if (mediaContent) return mediaContent

  const mediaThumb = fromMediaArray(raw['media:thumbnail'])
  if (mediaThumb) return mediaThumb

  const itunes = raw['itunes:image']
  if (itunes && typeof itunes === 'object') {
    const attrs = (itunes as { $?: unknown }).$
    if (attrs && typeof attrs === 'object') {
      const href = (attrs as { href?: unknown }).href
      if (typeof href === 'string' && href.trim()) return safeUrl(href)
    }
  }

  const image = raw.image as { url?: unknown } | undefined
  if (image && typeof image === 'object' && typeof image.url === 'string' && image.url.trim()) {
    return safeUrl(image.url)
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
