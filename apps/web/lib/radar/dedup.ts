// Meme Radar — deterministic dedup helpers.
//
// The fingerprint is sha1(normalizedTitle + '|' + rootDomain). Cross-outlet
// stories with matching titles do NOT collapse: different root domains
// yield different fingerprints by design (MVP rule).

import { createHash } from 'node:crypto'

const MULTI_PART_TLDS = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.au', 'com.br', 'com.mx', 'com.ar',
  'co.jp', 'co.kr', 'co.nz', 'co.za',
])

// Common suffix separators publishers append to feed titles. We strip
// only the trailing suffix block (everything after the last separator).
// Best-effort: missing a variant slightly inflates dedup candidates, it
// never causes false merges across outlets because rootDomain disagrees.
const TITLE_SUFFIX_RE = /\s+[\-–—|·]\s+[^\-–—|·]+$/u

export function rootDomain(url: string): string {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
  if (host.startsWith('www.')) host = host.slice(4)
  const parts = host.split('.').filter(Boolean)
  if (parts.length <= 2) return host
  const lastTwo = parts.slice(-2).join('.')
  if (MULTI_PART_TLDS.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.')
  }
  return lastTwo
}

export function normalizeTitle(title: string): string {
  let t = title.normalize('NFD').replace(/\p{M}+/gu, '')
  t = t.toLowerCase()
  // Strip a single trailing publisher suffix block (e.g. " - The Verge",
  // " | Le Monde", " — BBC News"). Run twice to catch occasional double
  // suffixes; bounded so it never degenerates.
  for (let i = 0; i < 2; i++) {
    const next = t.replace(TITLE_SUFFIX_RE, '')
    if (next === t) break
    t = next
  }
  // Strip punctuation, keep letters/numbers/whitespace.
  t = t.replace(/[^\p{L}\p{N}\s]/gu, ' ')
  // Collapse whitespace.
  t = t.replace(/\s+/g, ' ').trim()
  return t.slice(0, 120)
}

export function fingerprint(title: string, url: string): string {
  const nt = normalizeTitle(title)
  const rd = rootDomain(url)
  return createHash('sha1').update(`${nt}|${rd}`).digest('hex')
}

export function sha1Hex(input: string): string {
  return createHash('sha1').update(input).digest('hex')
}

// Strip HTML tags + decode a small set of common entities, then truncate.
// Used for the `summary` column. Not safe for arbitrary HTML rendering;
// values written here are never rendered as HTML in this codebase.
export function cleanSummary(raw: string | null | undefined, max = 500): string | null {
  if (!raw) return null
  const stripped = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
  if (!stripped) return null
  return stripped.length > max ? stripped.slice(0, max) : stripped
}
