// Provider orchestrator for Content Intelligence.
//
// Chain: Gemini → OpenAI (if openaiKey) → Mistral (if mistralKey).
// Stops as soon as a provider returns ok=true. On a failure, consults
// `shouldFallbackProvider` to decide whether to try the next provider
// or surface the failure immediately (permanent media errors only).
//
// On total failure, returns the LAST provider's result (so the upsert
// records the provider/model actually contacted last) with `error`
// rewritten to a stitched chain of all attempts:
//   "gemini:<err>|openai:<err>|mistral:<err>"
// Truncated to 500 chars to fit `post_content_analysis.error_message`.
//
// Per-attempt logging is emitted via `console.info` with a stable
// `[content-analysis]` prefix and sanitized error reason (no secrets,
// no media payloads, no caption text). Operators can `grep` the
// runtime logs to see which provider succeeded for any given post.

import { analyzePostMedia, type AnalyzeArgs, type AnalyzeResult } from '../gemini/analyze'
import {
  analyzePostMediaOpenAI,
  type AnalyzeOpenAIArgs,
  type AnalyzeOpenAIResult,
} from '../openai/analyze'
import {
  analyzePostMediaMistral,
  type AnalyzeMistralArgs,
  type AnalyzeMistralResult,
} from '../mistral/analyze'
import { shouldFallbackProvider } from './should-fallback'

export type FallbackResult =
  | AnalyzeResult
  | AnalyzeOpenAIResult
  | AnalyzeMistralResult

export interface FallbackConfig {
  openaiKey:    string | null
  openaiModel:  string
  mistralKey:   string | null
  mistralModel: string
}

export interface AnalyzeWithFallbackArgs extends AnalyzeArgs {
  fallback: FallbackConfig
}

// Optional dependency-injection seam for the smoke test
// (`scripts/content-analysis/verify-fallback.ts`). Production callers do
// not pass `deps`; the real implementations are used.
export interface FallbackDeps {
  gemini?:  (a: AnalyzeArgs)        => Promise<AnalyzeResult>
  openai?:  (a: AnalyzeOpenAIArgs)  => Promise<AnalyzeOpenAIResult>
  mistral?: (a: AnalyzeMistralArgs) => Promise<AnalyzeMistralResult>
}

type ProviderName = 'gemini' | 'openai' | 'mistral'

function sanitizeError(error: string | null | undefined): string {
  if (!error) return 'unknown'
  // Keep the structured prefix but cap length so a verbose upstream
  // body can't bloat the log line.
  return error.slice(0, 200)
}

function logAttempt(
  provider: ProviderName,
  model:    string,
  ok:       boolean,
  error?:   string,
): void {
  if (ok) {
    // eslint-disable-next-line no-console
    console.info(`[content-analysis] provider=${provider} model=${model} ok=true`)
    return
  }
  // eslint-disable-next-line no-console
  console.info(
    `[content-analysis] provider=${provider} model=${model} ok=false error=${sanitizeError(error)}`,
  )
}

export async function analyzeWithFallback(
  args:  AnalyzeWithFallbackArgs,
  deps?: FallbackDeps,
): Promise<FallbackResult> {
  const gemini  = deps?.gemini  ?? analyzePostMedia
  const openai  = deps?.openai  ?? analyzePostMediaOpenAI
  const mistral = deps?.mistral ?? analyzePostMediaMistral

  const { fallback, ...geminiArgs } = args
  const errors: string[] = []

  // 1) Gemini (primary)
  const gem = await gemini(geminiArgs)
  logAttempt('gemini', gem.model, gem.ok, gem.ok ? undefined : gem.error)
  if (gem.ok) return gem
  errors.push(`gemini:${gem.error}`)
  if (!shouldFallbackProvider(gem.error)) return gem

  // 2) OpenAI (fallback if configured)
  let lastResult: FallbackResult = gem
  const canOpenai = fallback.openaiKey !== null && fallback.openaiKey.length > 0
  if (canOpenai) {
    const oai = await openai({
      apiKey:    fallback.openaiKey!,
      model:     fallback.openaiModel,
      mediaUrl:  geminiArgs.mediaUrl,
      mediaType: geminiArgs.mediaType,
      caption:   geminiArgs.caption,
    })
    logAttempt('openai', oai.model, oai.ok, oai.ok ? undefined : oai.error)
    if (oai.ok) return oai
    errors.push(`openai:${oai.error}`)
    lastResult = oai
    if (!shouldFallbackProvider(oai.error)) {
      return { ...oai, error: stitch(errors) }
    }
  }

  // 3) Mistral (fallback if configured — typically the operator's
  // cost-conscious last resort; only attempted when MISTRAL_API_KEY is
  // set so the chain stays unchanged for accounts without it).
  const canMistral = fallback.mistralKey !== null && fallback.mistralKey.length > 0
  if (canMistral) {
    const mis = await mistral({
      apiKey:    fallback.mistralKey!,
      model:     fallback.mistralModel,
      mediaUrl:  geminiArgs.mediaUrl,
      mediaType: geminiArgs.mediaType,
      caption:   geminiArgs.caption,
    })
    logAttempt('mistral', mis.model, mis.ok, mis.ok ? undefined : mis.error)
    if (mis.ok) return mis
    errors.push(`mistral:${mis.error}`)
    lastResult = mis
  }

  return { ...lastResult, error: stitch(errors) }
}

function stitch(errors: string[]): string {
  return errors.join('|').slice(0, 500)
}
