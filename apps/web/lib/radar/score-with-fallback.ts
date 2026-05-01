// Provider orchestrator for Meme Radar scoring.
//
// Always tries Gemini first. If Gemini fails AND the failure is
// transient (high demand, 503, 429, RESOURCE_EXHAUSTED, timeout, …)
// AND the OpenAI fallback is configured, retries the item against
// OpenAI and returns that result. Permanent Gemini failures
// (schema_validation:*) are returned as-is — OpenAI cannot help
// when both providers reject the same input shape for the same
// reason. Mirrors `lib/content-analysis/analyze-with-fallback.ts`.

import { analyzeRadarItem, type RadarAnalyzeArgs, type RadarAnalyzeResult } from '../gemini/analyze-radar'
import { analyzeRadarItemOpenAI, type RadarAnalyzeOpenAIResult } from '../openai/analyze-radar'
import { isTransientGeminiError } from '../content-analysis/is-transient-gemini-error'

export type RadarFallbackResult = RadarAnalyzeResult | RadarAnalyzeOpenAIResult

export interface RadarFallbackConfig {
  enabled:     boolean
  openaiKey:   string | null
  openaiModel: string
}

export interface AnalyzeRadarWithFallbackArgs extends RadarAnalyzeArgs {
  fallback: RadarFallbackConfig
}

export async function analyzeRadarWithFallback(
  args: AnalyzeRadarWithFallbackArgs,
): Promise<RadarFallbackResult> {
  const { fallback, ...geminiArgs } = args

  const primary = await analyzeRadarItem(geminiArgs)
  if (primary.ok) return primary

  const canFallback =
    fallback.enabled && fallback.openaiKey !== null && fallback.openaiKey.length > 0
  if (!canFallback) return primary

  if (!isTransientGeminiError(primary.error)) return primary

  const openaiResult = await analyzeRadarItemOpenAI({
    apiKey: fallback.openaiKey!,
    model:  fallback.openaiModel,
    item:   geminiArgs.item,
  })

  if (openaiResult.ok) return openaiResult

  // Both providers failed: keep OpenAI provider/model attribution
  // (last attempt) but stitch both reasons into the error so the
  // operator can audit what happened.
  const combined = `gemini:${primary.error}|openai:${openaiResult.error}`
  return {
    ...openaiResult,
    error: combined.slice(0, 500),
  }
}
