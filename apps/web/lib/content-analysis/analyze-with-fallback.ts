// Provider orchestrator for Content Intelligence.
//
// Always tries Gemini first (the default primary). If Gemini fails AND
// the failure is transient (high demand, 503, 429, RESOURCE_EXHAUSTED,
// timeout, …) AND the OpenAI fallback is configured, retries the post
// against OpenAI and returns that result instead. Permanent Gemini
// failures (schema_validation, media_fetch_*, media_too_large_*) are
// returned as-is — OpenAI cannot help with those.
//
// Default behavior is unchanged: with no OpenAI envs / fallback flag
// off, this is a thin pass-through over `analyzePostMedia`.

import { analyzePostMedia, type AnalyzeArgs, type AnalyzeResult } from '../gemini/analyze'
import { analyzePostMediaOpenAI, type AnalyzeOpenAIResult } from '../openai/analyze'
import { isTransientGeminiError } from './is-transient-gemini-error'

export type FallbackResult = AnalyzeResult | AnalyzeOpenAIResult

export interface FallbackConfig {
  enabled:      boolean
  openaiKey:    string | null
  openaiModel:  string
}

export interface AnalyzeWithFallbackArgs extends AnalyzeArgs {
  fallback: FallbackConfig
}

export async function analyzeWithFallback(
  args: AnalyzeWithFallbackArgs,
): Promise<FallbackResult> {
  const { fallback, ...geminiArgs } = args

  const primary = await analyzePostMedia(geminiArgs)
  if (primary.ok) return primary

  const canFallback = fallback.enabled && fallback.openaiKey !== null && fallback.openaiKey.length > 0
  if (!canFallback) return primary

  if (!isTransientGeminiError(primary.error)) return primary

  const openaiResult = await analyzePostMediaOpenAI({
    apiKey:    fallback.openaiKey!,
    model:     fallback.openaiModel,
    mediaUrl:  geminiArgs.mediaUrl,
    mediaType: geminiArgs.mediaType,
    caption:   geminiArgs.caption,
  })

  if (openaiResult.ok) return openaiResult

  // Both providers failed: keep the OpenAI provider/model attribution
  // (since that was the last attempt) but stitch both reasons into the
  // error so the operator can audit what happened.
  const combined = `gemini:${primary.error}|openai:${openaiResult.error}`
  return {
    ...openaiResult,
    error: combined.slice(0, 500),
  }
}
