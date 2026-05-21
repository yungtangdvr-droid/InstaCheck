/* eslint-disable no-console */
//
// Smoke verification for the meme analysis fallback chain.
//
// Runs the orchestrator with stubbed provider implementations to prove
// the chain behavior without burning API quota or needing live keys.
// Invoke with:  pnpm --filter web tsx scripts/content-analysis/verify-fallback.ts
//
// Six cases (per the hotfix spec):
//   1. Gemini ok                                  → no OpenAI/Mistral call
//   2. Gemini fail (503)        → OpenAI ok       → no Mistral call
//   3. Gemini fail + OpenAI 429 + Mistral ok      → Mistral wins
//   4. Gemini fail + OpenAI fail + no MISTRAL_KEY → stitched error, last=openai
//   5. Gemini schema_validation fails through     → OpenAI ok
//   6. Gemini media_fetch_404                     → stops, no other calls

import { strict as assert } from 'node:assert'

import {
  analyzeWithFallback,
  type FallbackDeps,
} from '../../lib/content-analysis/analyze-with-fallback'
import type { AnalyzeArgs, AnalyzeResult } from '../../lib/gemini/analyze'
import type { AnalyzeOpenAIArgs, AnalyzeOpenAIResult } from '../../lib/openai/analyze'
import type { AnalyzeMistralArgs, AnalyzeMistralResult } from '../../lib/mistral/analyze'
import type { ContentAnalysis } from '../../lib/gemini/schema'
import { PROMPT_VERSION } from '../../lib/gemini/prompt'

const STUB_DATA: ContentAnalysis = {
  visible_text:          'stubbed',
  language:              'unknown',
  primary_theme:         'unknown',
  secondary_themes:      [],
  humor_type:            'unknown',
  format_pattern:        'unknown',
  cultural_reference:    'unknown',
  niche_level:           'unknown',
  replication_potential: 'unknown',
  confidence:            0.5,
  short_reason:          'stub',
}

const BASE_ARGS = {
  apiKey:    'k-gem',
  model:     'gemini-2.5-flash',
  mediaUrl:  'https://example.invalid/media.jpg',
  mediaType: 'IMAGE' as const,
  caption:   null,
}

function geminiOk(): AnalyzeResult {
  return {
    ok: true, provider: 'gemini', data: STUB_DATA, raw: null,
    inputTokens: 1, outputTokens: 1,
    model: BASE_ARGS.model, promptVersion: PROMPT_VERSION,
  }
}
function geminiErr(error: string): AnalyzeResult {
  return {
    ok: false, provider: 'gemini', error, raw: null,
    model: BASE_ARGS.model, promptVersion: PROMPT_VERSION,
  }
}
function openaiOk(): AnalyzeOpenAIResult {
  return {
    ok: true, provider: 'openai', data: STUB_DATA, raw: null,
    inputTokens: 1, outputTokens: 1,
    model: 'gpt-4o-mini', promptVersion: PROMPT_VERSION,
  }
}
function openaiErr(error: string): AnalyzeOpenAIResult {
  return {
    ok: false, provider: 'openai', error, raw: null,
    model: 'gpt-4o-mini', promptVersion: PROMPT_VERSION,
  }
}
function mistralOk(): AnalyzeMistralResult {
  return {
    ok: true, provider: 'mistral', data: STUB_DATA, raw: null,
    inputTokens: 1, outputTokens: 1,
    model: 'mistral-small-2506', promptVersion: PROMPT_VERSION,
  }
}
function mistralErr(error: string): AnalyzeMistralResult {
  return {
    ok: false, provider: 'mistral', error, raw: null,
    model: 'mistral-small-2506', promptVersion: PROMPT_VERSION,
  }
}

type Counters = { gemini: number; openai: number; mistral: number }

function buildDeps(
  geminiImpl:  (a: AnalyzeArgs) => Promise<AnalyzeResult>,
  openaiImpl:  (a: AnalyzeOpenAIArgs) => Promise<AnalyzeOpenAIResult>,
  mistralImpl: (a: AnalyzeMistralArgs) => Promise<AnalyzeMistralResult>,
): { deps: FallbackDeps; counters: Counters } {
  const counters: Counters = { gemini: 0, openai: 0, mistral: 0 }
  const deps: FallbackDeps = {
    gemini:  async (a) => { counters.gemini++;  return geminiImpl(a) },
    openai:  async (a) => { counters.openai++;  return openaiImpl(a) },
    mistral: async (a) => { counters.mistral++; return mistralImpl(a) },
  }
  return { deps, counters }
}

async function run() {
  let passed = 0
  let failed = 0
  const fail = (name: string, err: unknown) => {
    failed++
    console.error(`FAIL ${name}:`, err instanceof Error ? err.message : err)
  }
  const ok = (name: string) => {
    passed++
    console.log(`PASS ${name}`)
  }

  // Case 1
  try {
    const { deps, counters } = buildDeps(
      async () => geminiOk(),
      async () => { throw new Error('openai should not be called') },
      async () => { throw new Error('mistral should not be called') },
    )
    const r = await analyzeWithFallback({
      ...BASE_ARGS,
      fallback: { openaiKey: 'oai', openaiModel: 'gpt-4o-mini', mistralKey: 'mis', mistralModel: 'mistral-small-2506' },
    }, deps)
    assert.equal(r.ok, true)
    assert.equal(r.provider, 'gemini')
    assert.deepEqual(counters, { gemini: 1, openai: 0, mistral: 0 })
    ok('case1: gemini success → no OpenAI/Mistral call')
  } catch (e) { fail('case1', e) }

  // Case 2
  try {
    const { deps, counters } = buildDeps(
      async () => geminiErr('503 unavailable'),
      async () => openaiOk(),
      async () => { throw new Error('mistral should not be called') },
    )
    const r = await analyzeWithFallback({
      ...BASE_ARGS,
      fallback: { openaiKey: 'oai', openaiModel: 'gpt-4o-mini', mistralKey: 'mis', mistralModel: 'mistral-small-2506' },
    }, deps)
    assert.equal(r.ok, true)
    assert.equal(r.provider, 'openai')
    assert.deepEqual(counters, { gemini: 1, openai: 1, mistral: 0 })
    ok('case2: gemini fail → OpenAI success, Mistral untouched')
  } catch (e) { fail('case2', e) }

  // Case 3
  try {
    const { deps, counters } = buildDeps(
      async () => geminiErr('503 overloaded'),
      async () => openaiErr('openai_http_429:rate limit'),
      async () => mistralOk(),
    )
    const r = await analyzeWithFallback({
      ...BASE_ARGS,
      fallback: { openaiKey: 'oai', openaiModel: 'gpt-4o-mini', mistralKey: 'mis', mistralModel: 'mistral-small-2506' },
    }, deps)
    assert.equal(r.ok, true)
    assert.equal(r.provider, 'mistral')
    assert.deepEqual(counters, { gemini: 1, openai: 1, mistral: 1 })
    ok('case3: gemini + openai fail → Mistral success')
  } catch (e) { fail('case3', e) }

  // Case 4
  try {
    const { deps, counters } = buildDeps(
      async () => geminiErr('503 overloaded'),
      async () => openaiErr('openai_http_500:server error'),
      async () => { throw new Error('mistral should not be called') },
    )
    const r = await analyzeWithFallback({
      ...BASE_ARGS,
      fallback: { openaiKey: 'oai', openaiModel: 'gpt-4o-mini', mistralKey: null, mistralModel: 'mistral-small-2506' },
    }, deps)
    assert.equal(r.ok, false)
    assert.equal(r.provider, 'openai', 'last attempted provider should be OpenAI')
    assert.ok(r.error.startsWith('gemini:'),  `expected stitched error, got: ${r.error}`)
    assert.ok(r.error.includes('|openai:'),   `expected stitched error, got: ${r.error}`)
    assert.deepEqual(counters, { gemini: 1, openai: 1, mistral: 0 })
    ok('case4: gemini + openai fail, no Mistral key → stitched failed result')
  } catch (e) { fail('case4', e) }

  // Case 5
  try {
    const { deps, counters } = buildDeps(
      async () => geminiErr('schema_validation:visible_text'),
      async () => openaiOk(),
      async () => { throw new Error('mistral should not be called') },
    )
    const r = await analyzeWithFallback({
      ...BASE_ARGS,
      fallback: { openaiKey: 'oai', openaiModel: 'gpt-4o-mini', mistralKey: 'mis', mistralModel: 'mistral-small-2506' },
    }, deps)
    assert.equal(r.ok, true)
    assert.equal(r.provider, 'openai')
    assert.deepEqual(counters, { gemini: 1, openai: 1, mistral: 0 })
    ok('case5: gemini schema_validation now falls through to OpenAI')
  } catch (e) { fail('case5', e) }

  // Case 6
  try {
    const { deps, counters } = buildDeps(
      async () => geminiErr('media_fetch_404'),
      async () => { throw new Error('openai should not be called') },
      async () => { throw new Error('mistral should not be called') },
    )
    const r = await analyzeWithFallback({
      ...BASE_ARGS,
      fallback: { openaiKey: 'oai', openaiModel: 'gpt-4o-mini', mistralKey: 'mis', mistralModel: 'mistral-small-2506' },
    }, deps)
    assert.equal(r.ok, false)
    assert.equal(r.provider, 'gemini')
    assert.equal(r.error, 'media_fetch_404')
    assert.deepEqual(counters, { gemini: 1, openai: 0, mistral: 0 })
    ok('case6: media_fetch_404 stops the chain immediately')
  } catch (e) { fail('case6', e) }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

run().catch((err) => {
  console.error('uncaught:', err)
  process.exit(1)
})
