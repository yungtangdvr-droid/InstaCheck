// Pure helpers for the creative pattern key.
//
// The canonical pattern key is computed inside the SQL view
// v_post_pattern_assignment (migration 0022). The TS slugifier below MUST
// stay byte-for-byte equivalent to the SQL expression
//
//   lower(regexp_replace(segment, '[^a-zA-Z0-9]+', '-', 'g'))
//
// so a URL built in the browser resolves to the same row as the one read
// from the view. Tests live next to this file.

export function slugifyPatternSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
}

export function buildPatternKey(parts: {
  mediaType:     string
  primaryTheme:  string
  formatPattern: string
  humorType:     string
}): string {
  return [
    slugifyPatternSegment(parts.mediaType),
    slugifyPatternSegment(parts.primaryTheme),
    slugifyPatternSegment(parts.formatPattern),
    slugifyPatternSegment(parts.humorType),
  ].join('__')
}

// Validate that a string looks like a pattern key (4 segments, each one or
// more characters of [a-z0-9-]). Used by the [patternKey] route to short-
// circuit obviously malformed URLs into a 404 before hitting the DB.
const PATTERN_KEY_RE = /^[a-z0-9-]+(?:__[a-z0-9-]+){3}$/

export function isValidPatternKey(value: string): boolean {
  return PATTERN_KEY_RE.test(value)
}
