// OpenAI fallback provider for Content Intelligence.
//
// Mirrors the shape of `lib/gemini/analyze.ts` so the orchestrator can
// treat both providers uniformly. Uses Chat Completions (multimodal +
// Structured Outputs) called via plain `fetch` — no `openai` SDK
// dependency. Image is sent inline as a base64 data URL.
//
// The final validator is the existing `ContentAnalysisSchema` (Zod);
// `OPENAI_RESPONSE_JSON_SCHEMA` below is the request-side JSON Schema
// that OpenAI's `response_format: json_schema (strict)` enforces. Both
// schemas describe the same shape — keep them in sync if the Zod one
// ever changes.
//
// Reuses `SYSTEM_INSTRUCTION` and `PROMPT_VERSION` so the prompt
// contract is identical to the Gemini path.

import {
  ContentAnalysisSchema,
  FORMAT_PATTERNS,
  HUMOR_TYPES,
  LANGUAGE_VALUES,
  NICHE_LEVELS,
  PRIMARY_THEMES,
  REPLICATION_LEVELS,
  type ContentAnalysis,
} from '../gemini/schema'
import { PROMPT_VERSION, SYSTEM_INSTRUCTION } from '../gemini/prompt'

export type AnalyzeOpenAIOk = {
  ok: true
  provider: 'openai'
  data: ContentAnalysis
  raw: unknown
  inputTokens:  number | null
  outputTokens: number | null
  model:         string
  promptVersion: string
}

export type AnalyzeOpenAIErr = {
  ok: false
  provider: 'openai'
  error: string
  raw: unknown
  model:         string
  promptVersion: string
}

export type AnalyzeOpenAIResult = AnalyzeOpenAIOk | AnalyzeOpenAIErr

export interface AnalyzeOpenAIArgs {
  apiKey:    string
  model:     string
  mediaUrl:  string
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | string
  caption:   string | null
}

const FETCH_TIMEOUT_MS    = 15_000
const MAX_BYTES           = 10 * 1024 * 1024 // 10 MiB — same cap as the Gemini path
const OPENAI_TIMEOUT_MS   = 60_000
const OPENAI_ENDPOINT     = 'https://api.openai.com/v1/chat/completions'

// Vanilla JSON Schema mirror of ContentAnalysisSchema. OpenAI's strict
// Structured Outputs requires every property to be in `required` and
// `additionalProperties: false`. Defaults live in the Zod parser, not
// here — strict mode rejects `default`.
const OPENAI_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    visible_text:          { type: 'string' },
    language:              { type: 'string', enum: [...LANGUAGE_VALUES]   },
    primary_theme:         { type: 'string', enum: [...PRIMARY_THEMES]    },
    secondary_themes:      { type: 'array',  items: { type: 'string' }    },
    humor_type:            { type: 'string', enum: [...HUMOR_TYPES]       },
    format_pattern:        { type: 'string', enum: [...FORMAT_PATTERNS]   },
    cultural_reference:    { type: 'string' },
    niche_level:           { type: 'string', enum: [...NICHE_LEVELS]      },
    replication_potential: { type: 'string', enum: [...REPLICATION_LEVELS] },
    confidence:            { type: 'number' },
    short_reason:          { type: 'string' },
  },
  required: [
    'visible_text',
    'language',
    'primary_theme',
    'secondary_themes',
    'humor_type',
    'format_pattern',
    'cultural_reference',
    'niche_level',
    'replication_potential',
    'confidence',
    'short_reason',
  ],
} as const

async function fetchMediaBytes(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const ctrl = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  const res  = await fetch(url, { signal: ctrl })
  if (!res.ok) throw new Error(`media_fetch_${res.status}`)

  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const mimeType    = contentType.split(';')[0]?.trim() || 'image/jpeg'

  const ab = await res.arrayBuffer()
  if (ab.byteLength > MAX_BYTES) throw new Error(`media_too_large_${ab.byteLength}`)
  return { bytes: Buffer.from(ab), mimeType }
}

function buildUserText(caption: string | null, mediaType: string): string {
  const safeCaption = (caption ?? '').trim()
  const captionBlock = safeCaption.length > 0
    ? `"""${safeCaption}"""`
    : '<empty>'
  return [
    'Instagram caption (do not copy into visible_text — analyze separately):',
    captionBlock,
    `media_type_hint: ${mediaType}`,
  ].join('\n')
}

export async function analyzePostMediaOpenAI(args: AnalyzeOpenAIArgs): Promise<AnalyzeOpenAIResult> {
  const { apiKey, model, mediaUrl, mediaType, caption } = args
  const meta = { provider: 'openai' as const, model, promptVersion: PROMPT_VERSION }

  let bytes: Buffer
  let mimeType: string
  try {
    const fetched = await fetchMediaBytes(mediaUrl)
    bytes    = fetched.bytes
    mimeType = fetched.mimeType
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'media_fetch_unknown',
      raw: null,
      ...meta,
    }
  }

  const dataUrl = `data:${mimeType};base64,${bytes.toString('base64')}`

  const body = {
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      {
        role: 'user',
        content: [
          { type: 'text',      text: buildUserText(caption, mediaType) },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name:   'content_analysis',
        strict: true,
        schema: OPENAI_RESPONSE_JSON_SCHEMA,
      },
    },
  }

  let raw: unknown = null
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
      ok: false,
      error: err instanceof Error ? `openai_fetch:${err.message}` : 'openai_fetch_unknown',
      raw:   null,
      ...meta,
    }
  }

  if (!resp.ok) {
    let errText = ''
    try { errText = await resp.text() } catch { /* ignore */ }
    return {
      ok: false,
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
      ok: false,
      error: err instanceof Error ? `openai_parse:${err.message}` : 'openai_parse_unknown',
      raw:   null,
      ...meta,
    }
  }

  raw = payload

  const text         = extractContent(payload)
  const usage        = extractUsage(payload)
  const inputTokens  = typeof usage?.prompt_tokens     === 'number' ? usage.prompt_tokens     : null
  const outputTokens = typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null

  if (text === null) {
    return { ok: false, error: 'openai_empty_content', raw, ...meta }
  }

  const parsedJson = safeParse(text)
  const parsed     = ContentAnalysisSchema.safeParse(parsedJson)
  if (!parsed.success) {
    return {
      ok: false,
      error: `schema_validation:${parsed.error.issues.map((i) => i.path.join('.')).join(',')}`,
      raw,
      ...meta,
    }
  }

  return { ok: true, data: parsed.data, raw, inputTokens, outputTokens, ...meta }
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
  // OpenAI may sometimes return an array of content parts; flatten to string.
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
