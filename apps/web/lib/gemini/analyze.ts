import { GoogleGenAI } from '@google/genai'
import { ContentAnalysisSchema, GEMINI_RESPONSE_SCHEMA, type ContentAnalysis } from './schema'
import { PROMPT_VERSION, SYSTEM_INSTRUCTION } from './prompt'

export type AnalyzeOk = {
  ok: true
  provider: 'gemini'
  data: ContentAnalysis
  raw: unknown
  inputTokens:  number | null
  outputTokens: number | null
  model:         string
  promptVersion: string
}

export type AnalyzeErr = {
  ok: false
  provider: 'gemini'
  error: string
  raw: unknown
  model:         string
  promptVersion: string
}

export type AnalyzeResult = AnalyzeOk | AnalyzeErr

export interface AnalyzeArgs {
  apiKey:    string
  model:     string
  mediaUrl:  string
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | string
  caption:   string | null
}

const FETCH_TIMEOUT_MS = 15_000
const MAX_BYTES        = 10 * 1024 * 1024 // 10 MiB

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

function buildUserParts(caption: string | null) {
  const safeCaption = (caption ?? '').trim()
  return [
    {
      text:
        `Instagram caption (do not copy into visible_text — analyze separately):\n` +
        (safeCaption.length > 0 ? `"""${safeCaption}"""` : '<empty>'),
    },
  ]
}

export async function analyzePostMedia(args: AnalyzeArgs): Promise<AnalyzeResult> {
  const { apiKey, model, mediaUrl, mediaType, caption } = args
  const meta = { provider: 'gemini' as const, model, promptVersion: PROMPT_VERSION }

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

  const ai = new GoogleGenAI({ apiKey })

  const callOnce = async () =>
    ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: bytes.toString('base64'), mimeType } },
            ...buildUserParts(caption),
            { text: `media_type_hint: ${mediaType}` },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType:  'application/json',
        responseSchema:    GEMINI_RESPONSE_SCHEMA,
        temperature:       0.2,
      },
    })

  let raw: unknown = null
  try {
    let resp = await callOnce()
    let text = resp.text ?? ''
    raw  = safeParse(text)

    let parsed = ContentAnalysisSchema.safeParse(raw)
    if (!parsed.success) {
      // one retry — model occasionally drops a field
      resp = await callOnce()
      text = resp.text ?? ''
      raw  = safeParse(text)
      parsed = ContentAnalysisSchema.safeParse(raw)
    }

    if (!parsed.success) {
      return {
        ok: false,
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
      ok: false,
      error: err instanceof Error ? err.message : 'gemini_unknown_error',
      raw,
      ...meta,
    }
  }
}

function safeParse(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}
