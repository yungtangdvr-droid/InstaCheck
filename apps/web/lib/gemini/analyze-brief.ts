// Gemini text-only call for Meme Brief generation.
//
// Mirrors `analyze-radar.ts` but uses the brief prompt + schema.
// Single-retry on schema-validation failure.

import { GoogleGenAI } from '@google/genai'

import {
  BRIEF_PROMPT_VERSION,
  BRIEF_SYSTEM_INSTRUCTION,
} from '../briefs/brief-prompt'
import {
  BriefAnalysisSchema,
  GEMINI_BRIEF_RESPONSE_SCHEMA,
  type BriefAnalysis,
} from '../briefs/brief-schema'

export type BriefAnalyzeOk = {
  ok:            true
  provider:      'gemini'
  data:          BriefAnalysis
  raw:           unknown
  inputTokens:   number | null
  outputTokens:  number | null
  model:         string
  promptVersion: string
}

export type BriefAnalyzeErr = {
  ok:            false
  provider:      'gemini'
  error:         string
  raw:           unknown
  model:         string
  promptVersion: string
}

export type BriefAnalyzeResult = BriefAnalyzeOk | BriefAnalyzeErr

export interface BriefSignalContext {
  title:        string
  summary:      string | null
  sourceLabel:  string
  sourceDomain: string
  publishedAt:  string | null
  language:     string | null
}

export interface BriefAnalyzeArgs {
  apiKey:             string
  model:              string
  signal:             BriefSignalContext
  clusterSiblings?:   string[]
  tasteProfileBlock?: string | null
}

export function buildBriefUserText(
  signal:           BriefSignalContext,
  clusterSiblings:  string[],
  tasteBlock:       string | null,
): string {
  const payload = {
    signal: {
      title:         signal.title,
      summary:       signal.summary ?? '',
      source_label:  signal.sourceLabel,
      source_domain: signal.sourceDomain,
      published_at:  signal.publishedAt ?? '',
      language:      signal.language ?? '',
    },
    cluster_siblings: clusterSiblings.slice(0, 5),
  }
  const parts = [
    'Compress the following current signal into a meme brief per the system instruction.',
    'Return strict JSON only.',
    JSON.stringify(payload, null, 2),
  ]
  if (tasteBlock) parts.push(tasteBlock)
  return parts.join('\n')
}

export async function analyzeBrief(args: BriefAnalyzeArgs): Promise<BriefAnalyzeResult> {
  const {
    apiKey,
    model,
    signal,
    clusterSiblings = [],
    tasteProfileBlock = null,
  } = args
  const meta = { provider: 'gemini' as const, model, promptVersion: BRIEF_PROMPT_VERSION }

  const ai = new GoogleGenAI({ apiKey })

  const userText = buildBriefUserText(signal, clusterSiblings, tasteProfileBlock)
  const callOnce = async () =>
    ai.models.generateContent({
      model,
      contents: [
        { role: 'user', parts: [{ text: userText }] },
      ],
      config: {
        systemInstruction: BRIEF_SYSTEM_INSTRUCTION,
        responseMimeType:  'application/json',
        responseSchema:    GEMINI_BRIEF_RESPONSE_SCHEMA,
        temperature:       0.6,
      },
    })

  let raw: unknown = null
  try {
    let resp   = await callOnce()
    let text   = resp.text ?? ''
    raw        = safeParse(text)
    let parsed = BriefAnalysisSchema.safeParse(raw)

    if (!parsed.success) {
      resp   = await callOnce()
      text   = resp.text ?? ''
      raw    = safeParse(text)
      parsed = BriefAnalysisSchema.safeParse(raw)
    }

    if (!parsed.success) {
      return {
        ok:    false,
        error: `schema_validation:${parsed.error.issues.map((i) => i.path.join('.')).join(',')}`,
        raw,
        ...meta,
      }
    }

    const usage        = resp.usageMetadata
    const inputTokens  = typeof usage?.promptTokenCount     === 'number' ? usage.promptTokenCount     : null
    const outputTokens = typeof usage?.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : null

    return { ok: true, data: parsed.data, raw, inputTokens, outputTokens, ...meta }
  } catch (err) {
    return {
      ok:    false,
      error: err instanceof Error ? err.message : 'gemini_unknown_error',
      raw,
      ...meta,
    }
  }
}

function safeParse(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}
