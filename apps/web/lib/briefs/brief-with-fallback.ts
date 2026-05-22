// Provider orchestrator for Meme Brief generation.
//
// Mirrors `lib/radar/score-with-fallback.ts`. Gemini primary,
// OpenAI fallback only on transient Gemini failures.

import { analyzeBrief, type BriefAnalyzeArgs, type BriefAnalyzeResult } from '../gemini/analyze-brief'
import { analyzeBriefOpenAI, type BriefAnalyzeOpenAIResult } from '../openai/analyze-brief'
import { isTransientGeminiError } from '../content-analysis/is-transient-gemini-error'

export type BriefFallbackResult = BriefAnalyzeResult | BriefAnalyzeOpenAIResult

export interface BriefFallbackConfig {
  enabled:     boolean
  openaiKey:   string | null
  openaiModel: string
}

export interface AnalyzeBriefWithFallbackArgs extends BriefAnalyzeArgs {
  fallback: BriefFallbackConfig
}

export async function analyzeBriefWithFallback(
  args: AnalyzeBriefWithFallbackArgs,
): Promise<BriefFallbackResult> {
  const { fallback, ...geminiArgs } = args

  const primary = await analyzeBrief(geminiArgs)
  if (primary.ok) return primary

  const canFallback =
    fallback.enabled && fallback.openaiKey !== null && fallback.openaiKey.length > 0
  if (!canFallback) return primary

  if (!isTransientGeminiError(primary.error)) return primary

  const openaiResult = await analyzeBriefOpenAI({
    apiKey:            fallback.openaiKey!,
    model:             fallback.openaiModel,
    signal:            geminiArgs.signal,
    clusterSiblings:   geminiArgs.clusterSiblings,
    tasteProfileBlock: geminiArgs.tasteProfileBlock ?? null,
  })

  if (openaiResult.ok) return openaiResult

  const combined = `gemini:${primary.error}|openai:${openaiResult.error}`
  return {
    ...openaiResult,
    error: combined.slice(0, 500),
  }
}
