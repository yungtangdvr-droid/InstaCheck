// Quality guard for Meme Briefs.
//
// Flags briefs that drift into the corporate / growth-hacker register.
// When triggered, the brief is still persisted (so the operator can
// inspect what the model produced) but its `error_message` is set so
// downstream consumers can treat it as a low-quality output.

const BANNED_PHRASES: readonly string[] = [
  'create relatable content',
  'engage your audience',
  'engage with your audience',
  'leverage this trend',
  'leverage the trend',
  'try a similar format',
  'capitalize on',
  'capitalise on',
  'authentic content',
  'resonates with audiences',
  'resonates with your audience',
  'drive engagement',
  'boost engagement',
  'reach a wider audience',
  'tap into this trend',
  'go viral',
  'maximize reach',
  'optimize for engagement',
] as const

const BRIEF_TEXT_FIELDS = [
  'cultural_tension',
  'underlying_feeling',
  'contradiction',
  'meme_compression',
  'visual_direction',
  'caption_seed',
  'why_it_is_memeable',
  'risk_or_timing_caveat',
] as const

export interface BannedPhraseHit {
  field:  string
  phrase: string
}

export function detectBannedPhrases(
  brief: Record<string, unknown>,
): BannedPhraseHit[] {
  const hits: BannedPhraseHit[] = []
  for (const field of BRIEF_TEXT_FIELDS) {
    const value = brief[field]
    if (typeof value !== 'string' || value.length === 0) continue
    const lower = value.toLowerCase()
    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase)) hits.push({ field, phrase })
    }
  }
  return hits
}

export function formatBannedPhraseHits(hits: BannedPhraseHit[]): string {
  if (hits.length === 0) return ''
  return `quality_guard:${hits.map((h) => `${h.field}=${h.phrase}`).join('|')}`
}
