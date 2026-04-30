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
      rawJson:     it as unknown as Record<string, unknown>,
    })
  }
  return { items, feedTitle: feed.title ?? null }
}
