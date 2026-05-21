// Mistral fallback provider for Content Intelligence.
//
// Mirrors the shape of `lib/openai/analyze.ts` so the orchestrator can
// treat all three providers (Gemini → OpenAI → Mistral) uniformly. Uses
// Mistral's OpenAI-compatible chat completions endpoint with a vision
// model (default `mistral-small-2506`), called via plain `fetch` — no
// SDK dependency. Image is sent inline as a base64 data URL, identical
// to the OpenAI path.
//
// Validation is server-side via the existing `ContentAnalysisSchema`
// (Zod). Mistral's `response_format` does not support strict JSON
// Schema across all models, so we request `json_object` and let the
// Zod parser do the final shape enforcement — same defensive posture
// as the Gemini path uses for its single retry.

import {
  ContentAnalysisSchema,
  type ContentAnalysis,
} from '../gemini/schema'
import { PROMPT_VERSION, SYSTEM_INSTRUCTION } from '../gemini/prompt'

export type AnalyzeMistralOk = {
  ok: true
  provider: 'mistral'
  data: ContentAnalysis
  raw: unknown
  inputTokens:  number | null
  outputTokens: number | null
  model:         string
  promptVersion: string
}

export type AnalyzeMistralErr = {
  ok: false
  provider: 'mistral'
  error: string
  raw: unknown
  model:         string
  promptVersion: string
}

export type AnalyzeMistralResult = AnalyzeMistralOk | AnalyzeMistralErr

export interface AnalyzeMistralArgs {
  apiKey:    string
  model:     string
  mediaUrl:  string
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | string
  caption:   string | null
}

const FETCH_TIMEOUT_MS  = 15_000
const MAX_BYTES         = 10 * 1024 * 1024 // 10 MiB — same cap as Gemini/OpenAI
const MISTRAL_TIMEOUT_MS = 60_000
const MISTRAL_ENDPOINT   = 'https://api.mistral.ai/v1/chat/completions'

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
    'Respond with a single JSON object matching the requested schema. No prose.',
  ].join('\n')
}

export async function analyzePostMediaMistral(
  args: AnalyzeMistralArgs,
): Promise<AnalyzeMistralResult> {
  const { apiKey, model, mediaUrl, mediaType, caption } = args
  const meta = { provider: 'mistral' as const, model, promptVersion: PROMPT_VERSION }

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
    response_format: { type: 'json_object' },
  }

  let resp: Response
  try {
    resp = await fetch(MISTRAL_ENDPOINT, {
      method:  'POST',
      signal:  AbortSignal.timeout(MISTRAL_TIMEOUT_MS),
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `mistral_fetch:${err.message}` : 'mistral_fetch_unknown',
      raw:   null,
      ...meta,
    }
  }

  if (!resp.ok) {
    let errText = ''
    try { errText = await resp.text() } catch { /* ignore */ }
    return {
      ok: false,
      error: `mistral_http_${resp.status}:${errText.slice(0, 200)}`,
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
      error: err instanceof Error ? `mistral_parse:${err.message}` : 'mistral_parse_unknown',
      raw:   null,
      ...meta,
    }
  }

  const raw          = payload
  const text         = extractContent(payload)
  const usage        = extractUsage(payload)
  const inputTokens  = typeof usage?.prompt_tokens     === 'number' ? usage.prompt_tokens     : null
  const outputTokens = typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null

  if (text === null || text.length === 0) {
    return { ok: false, error: 'mistral_empty_content', raw, ...meta }
  }

  const parsedJson = safeParse(text)
  if (parsedJson === null) {
    return { ok: false, error: 'mistral_invalid_json', raw, ...meta }
  }
  const parsed = ContentAnalysisSchema.safeParse(parsedJson)
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
  // Mistral may return an array of content parts (OpenAI-compat); flatten.
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
