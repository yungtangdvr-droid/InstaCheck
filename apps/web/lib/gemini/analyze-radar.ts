// Gemini text-only call for Meme Radar scoring.
//
// Mirrors the shape of `analyze.ts` but skips media fetching and
// uses the radar prompt + schema. Single-retry on schema-validation
// failure (the model occasionally drops a field on the first pass).

import { GoogleGenAI } from '@google/genai'

import { RADAR_PROMPT_VERSION, RADAR_SYSTEM_INSTRUCTION } from './radar-prompt'
import {
  GEMINI_RADAR_RESPONSE_SCHEMA,
  RadarAnalysisSchema,
  type RadarAnalysis,
} from './radar-schema'

export type RadarAnalyzeOk = {
  ok:            true
  provider:      'gemini'
  data:          RadarAnalysis
  raw:           unknown
  inputTokens:   number | null
  outputTokens:  number | null
  model:         string
  promptVersion: string
}

export type RadarAnalyzeErr = {
  ok:            false
  provider:      'gemini'
  error:         string
  raw:           unknown
  model:         string
  promptVersion: string
}

export type RadarAnalyzeResult = RadarAnalyzeOk | RadarAnalyzeErr

export interface RadarItemContext {
  title:        string
  summary:      string | null
  sourceLabel:  string
  sourceDomain: string
  publishedAt:  string | null
}

export interface RadarAnalyzeArgs {
  apiKey:             string
  model:              string
  item:               RadarItemContext
  tasteProfileBlock?: string | null
}

export function buildRadarUserText(
  item:              RadarItemContext,
  tasteProfileBlock: string | null,
): string {
  // Plain JSON-ish block. The system instruction explicitly tells the
  // model to treat these as data fields, not instructions, so we don't
  // try to escape the strings — the model is the validator.
  const payload = {
    title:         item.title,
    summary:       item.summary ?? '',
    source_label:  item.sourceLabel,
    source_domain: item.sourceDomain,
    published_at:  item.publishedAt ?? '',
  }
  const parts = [
    'Score the following news item per the system instruction.',
    'Return strict JSON only.',
    JSON.stringify(payload, null, 2),
  ]
  if (tasteProfileBlock) parts.push(tasteProfileBlock)
  return parts.join('\n')
}

export async function analyzeRadarItem(args: RadarAnalyzeArgs): Promise<RadarAnalyzeResult> {
  const { apiKey, model, item, tasteProfileBlock = null } = args
  const meta = { provider: 'gemini' as const, model, promptVersion: RADAR_PROMPT_VERSION }

  const ai = new GoogleGenAI({ apiKey })

  const userText = buildRadarUserText(item, tasteProfileBlock)
  const callOnce = async () =>
    ai.models.generateContent({
      model,
      contents: [
        { role: 'user', parts: [{ text: userText }] },
      ],
      config: {
        systemInstruction: RADAR_SYSTEM_INSTRUCTION,
        responseMimeType:  'application/json',
        responseSchema:    GEMINI_RADAR_RESPONSE_SCHEMA,
        temperature:       0.3,
      },
    })

  let raw: unknown = null
  try {
    let resp   = await callOnce()
    let text   = resp.text ?? ''
    raw        = safeParse(text)
    let parsed = RadarAnalysisSchema.safeParse(raw)

    if (!parsed.success) {
      // One retry — model occasionally drops a field or returns 2 angles.
      resp   = await callOnce()
      text   = resp.text ?? ''
      raw    = safeParse(text)
      parsed = RadarAnalysisSchema.safeParse(raw)
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
