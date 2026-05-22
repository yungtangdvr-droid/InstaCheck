// Meme Brief — quality guard (v1.2).
//
// Combines banned-phrase detection with a positive "meme-native
// minimum" check. The result is informational: the brief is still
// persisted (so the operator can audit what the model produced) but
// `error_message` carries the verdict so the UI can render a
// "Quality guard" badge and skip surfacing the brief as ready-to-ship.
//
// v1.2: `observable_behavior` is now a top-level field. The guard
// reads it there first, falling back to `meme_grammar.observable_behavior`
// for backward compatibility with v1.1 outputs that may still be in
// flight. Same applies to the failure-mode field (`why_it_might_fail`
// top-level, `meme_grammar.why_might_fail` legacy).

import { detectBannedPhrases, formatBannedPhraseHits } from './banned-phrases'

// Concrete visual template / format tokens that should appear in
// `visual_direction`. Matched lowercase; one match is enough.
const TEMPLATE_TOKENS: readonly string[] = [
  'pov',
  'starter pack',
  'two-panel',
  'two panel',
  'before/after',
  'before / after',
  'side-by-side',
  'side by side',
  'screenshot',
  'fake dm',
  'fake message',
  'fake tweet',
  'fake email',
  'fake invite',
  'calendar invite',
  'overlay',
  'caption overlay',
  'text overlay',
  'split screen',
  'split-screen',
  'reaction',
  'grid',
  'stacked',
  'storytime',
  'meme template',
  'thumbnail',
  'selfie',
  'panel',
]

// Generic words that, when used as THE explanation of why something is
// memeable, mean nothing. Trigger only if `why_it_is_memeable` is
// dominated by these words.
const GENERIC_EXPLAINER_TOKENS: readonly string[] = [
  'relatable',
  'engaging',
  'engagement',
  'audience',
  'resonates',
  'resonate',
  'authentic',
  'viral',
  'trending',
  'trend',
]

// Strategy-copy hints that disqualify a caption_seed.
const STRATEGY_COPY_TOKENS: readonly string[] = [
  'engage',
  'leverage',
  'capitalize',
  'capitalise',
  'audience',
  'engagement',
  'authentic',
  'reach',
  'discover',
  'unlock',
  'inspire',
  'empower',
]

export interface QualityFlag {
  code:    string
  field:   string | null
  message: string
}

export interface QualityResult {
  passed:  boolean
  message: string | null
  flags:   QualityFlag[]
}

function lower(v: unknown): string {
  return typeof v === 'string' ? v.toLowerCase() : ''
}

function isLikelyAbstract(line: string): boolean {
  // Heuristic: short abstract lines are typically strategy-shaped.
  // Reject if the line is too short or doesn't contain a concrete
  // anchor (a verb hint, a proper-ish noun, or a meme-grammar cue).
  const trimmed = line.trim()
  if (trimmed.length < 12) return true
  // a postable meme line tends to contain at least one of these
  // shapes: "pov", "moi qui", "me when", "when you", a colon-separated
  // setup, an action verb, an everyday object reference.
  const concreteHints = /(pov|moi qui|moi après|me when|when you|: |:\s|c'est|tu sais|j'ai|i just|that one|le moment|le jour|on est|on a|ils ont|il a|elle a)/i
  if (concreteHints.test(trimmed)) return false
  // a meme line that names a concrete object often beats this floor
  if (/[a-z]+(linkedin|insta|stories?|tiktok|outlook|calendar|teams|slack|uber|tinder)/i.test(trimmed)) return false
  // last-resort: a slash or onomatopoeia / punctuation rhythm
  if (/[/—–-]/.test(trimmed) && trimmed.length > 24) return false
  return true
}

function countMatches(haystack: string, tokens: readonly string[]): number {
  let n = 0
  for (const t of tokens) if (haystack.includes(t)) n += 1
  return n
}

// Public entry point used by `generate-batch.ts`. Receives both the
// validated `data` (already-parsed BriefAnalysis as a record) and the
// raw payload (so meme_grammar subfields can be inspected even if we
// later relax the Zod schema). `raw` may be null.
export function evaluateBriefQuality(
  data: Record<string, unknown>,
  raw:  Record<string, unknown> | null,
): QualityResult {
  const flags: QualityFlag[] = []

  // Negative: banned phrases (corporate register, strategy verbs,
  // generic genre labels).
  const phraseHits = detectBannedPhrases(data)
  if (phraseHits.length > 0) {
    flags.push({
      code:    'banned_phrase',
      field:   phraseHits[0].field,
      message: formatBannedPhraseHits(phraseHits),
    })
  }

  // Positive: meme-native minimum.

  const memeCompression = lower(data.meme_compression)
  if (memeCompression.length > 0 && isLikelyAbstract(memeCompression)) {
    flags.push({
      code:    'meme_compression_too_abstract',
      field:   'meme_compression',
      message: 'meme_compression sounds abstract / strategy-shaped, not postable',
    })
  }

  const visualDirection = lower(data.visual_direction)
  if (visualDirection.length > 0) {
    const hasTemplateNoun = TEMPLATE_TOKENS.some((t) => visualDirection.includes(t))
    if (!hasTemplateNoun) {
      flags.push({
        code:    'visual_direction_no_template',
        field:   'visual_direction',
        message: 'visual_direction does not name a concrete meme template or visible format',
      })
    }
  }

  const whyMemeable = lower(data.why_it_is_memeable)
  if (whyMemeable.length > 0) {
    const generic = countMatches(whyMemeable, GENERIC_EXPLAINER_TOKENS)
    const wordCount = whyMemeable.split(/\s+/).filter(Boolean).length
    if (wordCount > 0 && generic >= 2 && generic / Math.max(wordCount, 1) > 0.12) {
      flags.push({
        code:    'why_memeable_generic',
        field:   'why_it_is_memeable',
        message: 'why_it_is_memeable explains the meme only with generic words (relatable / engaging / audience / viral)',
      })
    }
  }

  const captionSeed = lower(data.caption_seed)
  if (captionSeed.length > 0) {
    const strategyHits = STRATEGY_COPY_TOKENS.filter((t) => captionSeed.includes(t)).length
    if (strategyHits >= 2) {
      flags.push({
        code:    'caption_seed_strategy_copy',
        field:   'caption_seed',
        message: 'caption_seed sounds like brand / strategy copy, not meme text',
      })
    }
  }

  // meme_grammar — diagnosis object (v1.2:
  // content/form/stance/template_type/implied_viewer/remixability/why_now).
  // Used for the missing-diagnosis flag only; observable behavior is
  // now a top-level field.
  const grammar =
    (data.meme_grammar && typeof data.meme_grammar === 'object'
      ? (data.meme_grammar as Record<string, unknown>)
      : raw && typeof raw.meme_grammar === 'object' && raw.meme_grammar !== null
        ? (raw.meme_grammar as Record<string, unknown>)
        : null)

  if (!grammar) {
    flags.push({
      code:    'meme_grammar_missing',
      field:   'meme_grammar',
      message: 'meme_grammar diagnosis missing',
    })
  }

  // observable_behavior — load-bearing in v1.2. Read top-level first,
  // then fall back to `meme_grammar.observable_behavior` for v1.1 shape.
  const observableTop = lower(data.observable_behavior)
  const observableLegacy = grammar ? lower(grammar.observable_behavior) : ''
  const observable = observableTop || observableLegacy
  if (observable.length === 0 || observable.split(/\s+/).filter(Boolean).length < 3) {
    flags.push({
      code:    'no_observable_behavior',
      field:   'observable_behavior',
      message: 'no concrete observable behavior named',
    })
  }

  // Contradiction is one of the load-bearing v1.1 fields — if it is
  // empty or echoes the headline (extremely short, no two-clause
  // structure), warn. We do not block on this alone — counts as a
  // single flag.
  const contradiction = lower(data.contradiction)
  if (contradiction.length > 0 && contradiction.length < 20) {
    flags.push({
      code:    'contradiction_thin',
      field:   'contradiction',
      message: 'contradiction is too thin to anchor a meme',
    })
  }

  if (flags.length === 0) {
    return { passed: true, message: null, flags: [] }
  }

  // Compose a compact message suitable for `error_message` (≤ 500
  // chars). Banned phrases take precedence in the prefix so existing
  // dashboards that look for the `quality_guard:` token keep working.
  const parts = flags.map((f) => `${f.code}${f.field ? `(${f.field})` : ''}`)
  const composed = `quality_guard:${parts.join('|')}`
  return { passed: false, message: composed.slice(0, 500), flags }
}
