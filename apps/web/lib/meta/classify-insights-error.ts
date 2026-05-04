// Pure classifier for Meta /insights outcomes against a single
// media item. Has zero I/O — operates only on strings parsed from
// `graphGet`'s thrown error message ("Meta API <status>: <body>")
// and on the parsed response object.
//
// Lives outside instagram-client.ts on purpose so we can reuse it
// from the read-only probe (PR: probe-archive-insights-availability)
// and, eventually, from a persisted classifier in the live sync
// path. No production caller imports it yet.

export type TInsightsErrorClass =
  | 'before_business_conversion'
  | 'unsupported_metric'
  | 'unsupported_media_type'
  | 'permission_error'
  | 'rate_limit'
  | 'empty_data'
  | 'basic_fields_only'
  | 'unknown'

export type TParsedMetaError = {
  status:           number | null
  code:             number | null
  errorSubcode:     number | null
  errorUserTitle:   string | null
  errorUserMessage: string | null
  type:             string | null
  message:          string | null
  raw:              string
}

const METRIC_NAMES = [
  'profile_visits',
  'saved',
  'shares',
  'reach',
  'impressions',
  'likes',
  'comments',
  'replies',
  'plays',
  'video_views',
  'total_interactions',
] as const

// Subcode 2108006 is Meta's documented signal for "Media Posted
// Before Business Account Conversion" on /insights. We match it
// strictly; the human title is also matched as a fallback for
// payloads where only the localized title is present.
const SUBCODE_BEFORE_CONVERSION = 2108006

const BEFORE_CONVERSION_TITLE_RE =
  /media\s+posted\s+before\s+business\s+account\s+conversion/i

const PERMISSION_HINTS_RE =
  /instagram_manage_insights|\(#10\)|OAuthException|permission/i

export function parseMetaErrorMessage(message: string): TParsedMetaError {
  const parsed: TParsedMetaError = {
    status:           null,
    code:             null,
    errorSubcode:     null,
    errorUserTitle:   null,
    errorUserMessage: null,
    type:             null,
    message:          null,
    raw:              message,
  }

  const statusMatch = message.match(/Meta API (\d{3})/)
  if (statusMatch) parsed.status = Number.parseInt(statusMatch[1]!, 10)

  // Body starts after the first ": ". Try to JSON-parse it; fall back
  // to regex sniffing if the body is not valid JSON (older Meta
  // responses occasionally return HTML on infra errors).
  const bodyStart = message.indexOf(': ')
  const body = bodyStart >= 0 ? message.slice(bodyStart + 2).trim() : ''
  if (body.length > 0) {
    try {
      const obj = JSON.parse(body) as { error?: Record<string, unknown> }
      const err = obj?.error
      if (err && typeof err === 'object') {
        if (typeof err['code']             === 'number') parsed.code             = err['code']             as number
        if (typeof err['error_subcode']    === 'number') parsed.errorSubcode     = err['error_subcode']    as number
        if (typeof err['error_user_title'] === 'string') parsed.errorUserTitle   = err['error_user_title'] as string
        if (typeof err['error_user_msg']   === 'string') parsed.errorUserMessage = err['error_user_msg']   as string
        if (typeof err['type']             === 'string') parsed.type             = err['type']             as string
        if (typeof err['message']          === 'string') parsed.message          = err['message']          as string
      }
    } catch {
      // Non-JSON body — leave structured fields null.
    }
  }
  return parsed
}

// Find the first metric name mentioned in any of the human-facing
// strings. Used to attribute `unsupported_metric` to a metric.
export function findMentionedMetric(parsed: TParsedMetaError): string | null {
  const haystacks: string[] = []
  if (parsed.message)          haystacks.push(parsed.message)
  if (parsed.errorUserMessage) haystacks.push(parsed.errorUserMessage)
  if (parsed.errorUserTitle)   haystacks.push(parsed.errorUserTitle)
  haystacks.push(parsed.raw)

  for (const h of haystacks) {
    for (const m of METRIC_NAMES) {
      if (h.includes(m)) return m
    }
  }
  return null
}

export type TInsightsClassification = {
  class:        TInsightsErrorClass
  parsed:       TParsedMetaError | null
  metric:       string | null
  detail:       string | null
}

// Classify an error message thrown from /{media-id}/insights.
// `mediaType` is informational and only used to disambiguate
// STORY-shaped failures.
export function classifyInsightsError(
  message:   string,
  mediaType: string | null
): TInsightsClassification {
  const parsed = parseMetaErrorMessage(message)
  const metric = findMentionedMetric(parsed)

  // 1. before_business_conversion — strictly subcode-driven, with
  //    a localized-title fallback. We deliberately do NOT classify
  //    on date heuristics; only Meta's own signal counts.
  if (parsed.errorSubcode === SUBCODE_BEFORE_CONVERSION) {
    return {
      class:  'before_business_conversion',
      parsed,
      metric,
      detail: parsed.errorUserTitle ?? parsed.message ?? null,
    }
  }
  if (parsed.errorUserTitle && BEFORE_CONVERSION_TITLE_RE.test(parsed.errorUserTitle)) {
    return {
      class:  'before_business_conversion',
      parsed,
      metric,
      detail: parsed.errorUserTitle,
    }
  }

  // 2. rate_limit — 429 wins regardless of body.
  if (parsed.status === 429) {
    return { class: 'rate_limit', parsed, metric, detail: parsed.message ?? null }
  }
  // Meta application-level rate codes (#4 user-level, #17 app-level,
  // #32 page-level). Match `(#4)` etc. with word boundaries to avoid
  // matching #40, #400, etc.
  const rateCodeRe = /\(#(?:4|17|32)\)/
  if (parsed.code === 4 || parsed.code === 17 || parsed.code === 32 || rateCodeRe.test(parsed.raw)) {
    return { class: 'rate_limit', parsed, metric, detail: parsed.message ?? null }
  }

  // 3. permission_error — token / scope problems.
  const permissionHaystack = [
    parsed.message ?? '',
    parsed.errorUserTitle ?? '',
    parsed.errorUserMessage ?? '',
    parsed.type ?? '',
    parsed.raw,
  ].join(' ')
  if (PERMISSION_HINTS_RE.test(permissionHaystack)) {
    return { class: 'permission_error', parsed, metric, detail: parsed.message ?? null }
  }

  // 4. unsupported_metric — error explicitly names a metric.
  if (metric !== null) {
    return { class: 'unsupported_metric', parsed, metric, detail: parsed.message ?? null }
  }

  // 5. unsupported_media_type — heuristic for STORY past 24h or
  //    REEL/CAROUSEL on a metric set Meta refuses, when no metric
  //    name is mentioned but the error references the media itself.
  const mediaTypeHaystack = [
    parsed.message ?? '',
    parsed.errorUserTitle ?? '',
    parsed.errorUserMessage ?? '',
    parsed.raw,
  ].join(' ')
  if (
    /unsupported.*media|media.*type.*not.*supported|story.*expired|story.*unavailable/i.test(
      mediaTypeHaystack
    )
  ) {
    return {
      class:  'unsupported_media_type',
      parsed,
      metric,
      detail: parsed.message ?? mediaType ?? null,
    }
  }

  return { class: 'unknown', parsed, metric, detail: parsed.message ?? null }
}

// Classify a successful /{media-id}/insights response. Used to
// distinguish "Meta returned 200 with empty data" (which is what
// pre-conversion organic media often looks like in practice when
// no subcode is present) from "Meta returned populated insights".
export function classifyInsightsResponse(args: {
  data: Array<{ name: string; values?: Array<{ value: unknown }> }>
}): TInsightsErrorClass | 'available' {
  if (!Array.isArray(args.data) || args.data.length === 0) return 'empty_data'
  let hasNumeric = false
  for (const insight of args.data) {
    const v = insight.values?.[0]?.value
    if (typeof v === 'number') {
      hasNumeric = true
      break
    }
  }
  return hasNumeric ? 'available' : 'empty_data'
}
