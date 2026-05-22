// OpenAI text-only fallback for Meme Brief generation.
//
// Mirrors `lib/openai/analyze-radar.ts`. Plain `fetch` against Chat
// Completions, strict Structured Outputs.

import {
  BRIEF_PROMPT_VERSION,
  BRIEF_SYSTEM_INSTRUCTION,
} from '../briefs/brief-prompt'
import {
  BriefAnalysisSchema,
  OPENAI_BRIEF_JSON_SCHEMA,
  type BriefAnalysis,
} from '../briefs/brief-schema'
import { buildBriefUserText, type BriefSignalContext } from '../gemini/analyze-brief'

export type BriefAnalyzeOpenAIOk = {
  ok:            true
  provider:      'openai'
  data:          BriefAnalysis
  raw:           unknown
  inputTokens:   number | null
  outputTokens:  number | null
  model:         string
  promptVersion: string
}

export type BriefAnalyzeOpenAIErr = {
  ok:            false
  provider:      'openai'
  error:         string
  raw:           unknown
  model:         string
  promptVersion: string
}

export type BriefAnalyzeOpenAIResult = BriefAnalyzeOpenAIOk | BriefAnalyzeOpenAIErr

export interface BriefAnalyzeOpenAIArgs {
  apiKey:             string
  model:              string
  signal:             BriefSignalContext
  clusterSiblings?:   string[]
  tasteProfileBlock?: string | null
}

const OPENAI_TIMEOUT_MS = 60_000
const OPENAI_ENDPOINT   = 'https://api.openai.com/v1/chat/completions'

export async function analyzeBriefOpenAI(
  args: BriefAnalyzeOpenAIArgs,
): Promise<BriefAnalyzeOpenAIResult> {
  const {
    apiKey,
    model,
    signal,
    clusterSiblings = [],
    tasteProfileBlock = null,
  } = args
  const meta = { provider: 'openai' as const, model, promptVersion: BRIEF_PROMPT_VERSION }

  const body = {
    model,
    temperature: 0.6,
    messages: [
      { role: 'system', content: BRIEF_SYSTEM_INSTRUCTION },
      { role: 'user',   content: buildBriefUserText(signal, clusterSiblings, tasteProfileBlock) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name:   'meme_brief',
        strict: true,
        schema: OPENAI_BRIEF_JSON_SCHEMA,
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

  let raw: unknown = null
  try {
    const json = await resp.json() as {
      choices?: Array<{ message?: { content?: string } }>
      usage?:   { prompt_tokens?: number; completion_tokens?: number }
    }
    const content = json.choices?.[0]?.message?.content ?? ''
    try { raw = JSON.parse(content) } catch { raw = null }
    const parsed = BriefAnalysisSchema.safeParse(raw)
    if (!parsed.success) {
      return {
        ok:    false,
        error: `schema_validation:${parsed.error.issues.map((i) => i.path.join('.')).join(',')}`,
        raw,
        ...meta,
      }
    }
    const inputTokens  = typeof json.usage?.prompt_tokens     === 'number' ? json.usage.prompt_tokens     : null
    const outputTokens = typeof json.usage?.completion_tokens === 'number' ? json.usage.completion_tokens : null
    return { ok: true, data: parsed.data, raw, inputTokens, outputTokens, ...meta }
  } catch (err) {
    return {
      ok:    false,
      error: err instanceof Error ? `openai_parse:${err.message}` : 'openai_parse_unknown',
      raw,
      ...meta,
    }
  }
}
