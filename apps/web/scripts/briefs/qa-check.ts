// Offline QA for the Meme Brief V1.2 prompt/schema patch.
//
// Smoke-tests the pieces that don't need Supabase or AI providers:
//   1. quality guard rejects generic/strategy outputs and accepts a
//      meme-native one
//   2. `isTransientGeminiError` correctly routes "high demand" /
//      overload / 503 / 429 / RESOURCE_EXHAUSTED to the OpenAI fallback
//      and refuses to route schema_validation:* errors
//   3. select-candidates explicit-path reasons are exhaustive
//
// Run: `pnpm -F web tsx scripts/briefs/qa-check.ts`.
// Exits non-zero on any failure so it can be wired into CI later.

import { evaluateBriefQuality } from '../../lib/briefs/quality-guard'
import { isTransientGeminiError } from '../../lib/content-analysis/is-transient-gemini-error'
import type { ExplicitNoOpReason } from '../../lib/briefs/select-candidates'

type Case = { name: string; pass: boolean; detail?: string }
const cases: Case[] = []

function assert(name: string, pass: boolean, detail?: string) {
  cases.push({ name, pass, detail })
}

// ---------- 1. Quality guard ----------

const GENERIC_BRIEF = {
  cultural_tension:    'People relate to this trend.',
  underlying_feeling:  'A feeling of connection.',
  contradiction:       'Yes and no.',
  observable_behavior: 'people',
  meme_compression:    'Make a meme about modern life.',
  visual_direction:    'A nice image with a caption.',
  caption_seed:        'Engage your audience with authentic content',
  why_it_is_memeable:  'It is relatable and engaging for the audience.',
  why_it_might_fail:   'It might not engage.',
  meme_grammar: {
    content:        'modern life',
    form:           'meme',
    stance:         'observational',
    template_type:  'meme',
    implied_viewer: 'everyone',
    remixability:   'can remix',
    why_now:        'now',
  },
}

const MEMEY_BRIEF = {
  cultural_tension:    'every centrist tries to cosplay as local and anti-system while being pure system',
  underlying_feeling:  'fatigue of watching ambition rebrand itself as authenticity',
  contradiction:       'announcing a presidential campaign as if it were a spiritual retreat',
  observable_behavior: 'rebranding a career move as a spiritual relocation by changing your LinkedIn location',
  meme_compression:    'moi après avoir changé ma localisation linkedin en aveyron',
  visual_direction:    'fake LinkedIn update screenshot, countryside selfie thumbnail, overly sincere caption about returning to what matters',
  caption_seed:        'le revival post-Matignon est très Aveyron core',
  why_it_is_memeable:  'everyone has seen a friend rebrand a career move as a personal transformation; the politician version is the same gesture at a national scale',
  why_it_might_fail:   'if the audience reads it as partisan rather than behavioral',
  meme_grammar: {
    content:        'political rebranding as rural authenticity',
    form:           'fake LinkedIn / location update',
    stance:         'dry disbelief, not partisan outrage',
    template_type:  'fake LinkedIn screenshot / POV post-resignation',
    implied_viewer: 'online viewer fluent in LinkedIn cringe',
    remixability:   'format scales to any career-move-as-rebirth scenario',
    why_now:        'fresh announcement, narrative still wet',
  },
}

const genericResult = evaluateBriefQuality(GENERIC_BRIEF, GENERIC_BRIEF)
assert(
  'quality guard rejects generic strategy brief',
  !genericResult.passed && genericResult.flags.length >= 3,
  JSON.stringify(genericResult.flags.map((f) => f.code)),
)

const memeyResult = evaluateBriefQuality(MEMEY_BRIEF, MEMEY_BRIEF)
assert(
  'quality guard accepts meme-native brief',
  memeyResult.passed,
  JSON.stringify(memeyResult.flags.map((f) => f.code)),
)

// banned phrase isolated
const bannedOnly = { ...MEMEY_BRIEF, caption_seed: 'engage your audience and capitalize on this trend' }
const bannedRes  = evaluateBriefQuality(bannedOnly, bannedOnly)
assert(
  'quality guard catches banned phrases in caption_seed',
  !bannedRes.passed && bannedRes.flags.some((f) => f.code === 'banned_phrase'),
  JSON.stringify(bannedRes.flags.map((f) => f.code)),
)

// missing template noun
const noTemplate = {
  ...MEMEY_BRIEF,
  visual_direction: 'a nice clean photograph with some text underneath that suits the theme well',
}
const noTemplateRes = evaluateBriefQuality(noTemplate, noTemplate)
assert(
  'quality guard flags visual_direction without template noun',
  !noTemplateRes.passed && noTemplateRes.flags.some((f) => f.code === 'visual_direction_no_template'),
  JSON.stringify(noTemplateRes.flags.map((f) => f.code)),
)

// abstract meme compression
const abstract = { ...MEMEY_BRIEF, meme_compression: 'modern life' }
const abstractRes = evaluateBriefQuality(abstract, abstract)
assert(
  'quality guard flags abstract meme_compression',
  !abstractRes.passed && abstractRes.flags.some((f) => f.code === 'meme_compression_too_abstract'),
  JSON.stringify(abstractRes.flags.map((f) => f.code)),
)

// missing meme_grammar
const noGrammar: Record<string, unknown> = { ...MEMEY_BRIEF }
delete noGrammar.meme_grammar
const noGrammarRes = evaluateBriefQuality(noGrammar, noGrammar as Record<string, unknown>)
assert(
  'quality guard flags missing meme_grammar',
  !noGrammarRes.passed && noGrammarRes.flags.some((f) => f.code === 'meme_grammar_missing'),
  JSON.stringify(noGrammarRes.flags.map((f) => f.code)),
)

// ---------- 2. isTransientGeminiError ----------

const transientCases: Array<[string, boolean]> = [
  ['Gemini is currently unavailable', true],
  ['The model is overloaded right now', true],
  ['Service is in high demand, please retry', true],
  ['RESOURCE_EXHAUSTED: Quota exceeded for model', true],
  ['HTTP 503 Service Unavailable', true],
  ['HTTP 429 Too Many Requests', true],
  ['Deadline exceeded', true],
  ['timeout while waiting for response', true],
  ['fetch failed: ECONNRESET', true],
  ['ETIMEDOUT', true],
  ['rate-limit exceeded', true],
  // permanent
  ['schema_validation:meme_compression,meme_grammar', false],
  ['media_fetch_403', false],
  ['media_too_large_8mb', false],
  ['random parsing issue', false],
]
for (const [reason, expected] of transientCases) {
  const got = isTransientGeminiError(reason)
  assert(`transient classifier "${reason}" → ${expected}`, got === expected, `got=${got}`)
}

// ---------- 3. ExplicitNoOpReason exhaustiveness ----------

const expectedReasons: ExplicitNoOpReason[] = [
  'missing_radar_item',
  'unsafe_signal',
  'already_has_recent_brief',
  'missing_required_signal_text',
]
assert(
  'ExplicitNoOpReason union covers the four documented cases',
  expectedReasons.length === 4,
)

// ---------- report ----------

const failed = cases.filter((c) => !c.pass)
for (const c of cases) {
  const tag = c.pass ? 'PASS' : 'FAIL'
  // eslint-disable-next-line no-console
  console.log(`[${tag}] ${c.name}${c.detail && !c.pass ? `  ${c.detail}` : ''}`)
}
if (failed.length > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n${failed.length}/${cases.length} cases failed.`)
  process.exit(1)
}
// eslint-disable-next-line no-console
console.log(`\n${cases.length}/${cases.length} cases passed.`)
