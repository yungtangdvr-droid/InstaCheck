// OpenAI text-only fallback for Meme Radar scoring.
//
// Mirrors `lib/openai/analyze.ts` but is text-only (no image part)
// and uses the radar prompt + schema. Called only when the Gemini
// primary fails with a transient error AND the
// CONTENT_ANALYSIS_OPENAI_FALLBACK_ENABLED env is on. Uses plain
// `fetch` against Chat Completions — no `openai` SDK dependency.

import { RADAR_PROMPT_VERSION, RADAR_SYSTEM_INSTRUCTION } from '../gemini/radar-prompt'
import {
  OPENAI_RADAR_JSON_SCHEMA,
  RadarAnalysisSchema,
  type RadarAnalysis,
} from '../gemini/radar-schema'
import { buildRadarUserText, type RadarItemContext } from '../gemini/analyze-radar'

export type RadarAnalyzeOpenAIOk = {
  ok:            true
  provider:      'openai'
  data:          RadarAnalysis
  raw:           unknown
  inputTokens:   number | null
  outputTokens:  number | null
  model:         string
  promptVersion: string
}

export type RadarAnalyzeOpenAIErr = {
  ok:            false
  provider:      'openai'
  error:         string
  raw:           unknown
  model:         string
  promptVersion: string
}

export type RadarAnalyzeOpenAIResult = RadarAnalyzeOpenAIOk | RadarAnalyzeOpenAIErr

export interface RadarAnalyzeOpenAIArgs {
  apiKey:             string
  model:              string
  item:               RadarItemContext
  tasteProfileBlock?: string | null
}

const OPENAI_TIMEOUT_MS = 60_000
const OPENAI_ENDPOINT   = 'https://api.openai.com/v1/chat/completions'

export async function analyzeRadarItemOpenAI(
  args: RadarAnalyzeOpenAIArgs,
): Promise<RadarAnalyzeOpenAIResult> {
  const { apiKey, model, item, tasteProfileBlock = null } = args
  const meta = { provider: 'openai' as const, model, promptVersion: RADAR_PROMPT_VERSION }

  const body = {
    model,
    temperature: 0.3,
    messages: [
      { role: 'system', content: RADAR_SYSTEM_INSTRUCTION },
      { role: 'user',   content: buildRadarUserText(item, tasteProfileBlock) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name:   'radar_analysis',
        strict: true,
        schema: OPENAI_RADAR_JSON_SCHEMA,
      },
    },
  }

  let resp: Response
  try {
    resp = await fetch(OPENAI_ENDPOINT, {
      method:  'POST',
      signal:  AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    return {
      ok:    false,
      error: err instanceof Error ? `openai_fetch:${err.message}` : 'openai_fetch_unknown',
      raw:   null,
      ...meta,
    }
  }

  if (!resp.ok) {
    let errText = ''
    try { errText = await resp.text() } catch { /* ignore */ }
    return {
      ok:    false,
      error: `openai_http_${resp.status}:${errText.slice(0, 200)}`,
      raw:   null,
      ...meta,
    }
  }

  let payload: unknown
  try {
    payload = await resp.json()
  } catch (err) {
    return {
      ok:    false,
      error: err instanceof Error ? `openai_parse:${err.message}` : 'openai_parse_unknown',
      raw:   null,
      ...meta,
    }
  }

  const text         = extractContent(payload)
  const usage        = extractUsage(payload)
  const inputTokens  = typeof usage?.prompt_tokens     === 'number' ? usage.prompt_tokens     : null
  const outputTokens = typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null

  if (text === null) {
    return { ok: false, error: 'openai_empty_content', raw: payload, ...meta }
  }

  const parsedJson = safeParse(text)
  const parsed     = RadarAnalysisSchema.safeParse(parsedJson)
  if (!parsed.success) {
    return {
      ok:    false,
      error: `schema_validation:${parsed.error.issues.map((i) => i.path.join('.')).join(',')}`,
      raw:   payload,
      ...meta,
    }
  }

  return { ok: true, data: parsed.data, raw: payload, inputTokens, outputTokens, ...meta }
}

function safeParse(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}

function extractContent(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const first   = choices[0] as { message?: { content?: unknown } } | undefined
  const content = first?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === 'object' && p && 'text' in p && typeof (p as { text: unknown }).text === 'string'
        ? (p as { text: string }).text
        : ''))
      .join('')
  }
  return null
}

function extractUsage(payload: unknown): { prompt_tokens?: number; completion_tokens?: number } | null {
  if (!payload || typeof payload !== 'object') return null
  const usage = (payload as { usage?: unknown }).usage
  if (!usage || typeof usage !== 'object') return null
  return usage as { prompt_tokens?: number; completion_tokens?: number }
}
