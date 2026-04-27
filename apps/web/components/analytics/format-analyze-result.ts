// Single mapping from the /api/content/analyze-new response shape to the
// UI status + French message used by both AnalyzeNewButton and the
// chained-analysis branch of SyncNowButton. Keeping it here means the two
// buttons always agree on what each combination of completed / failed /
// retryable / noOpReason / disabled should look like, and never drift into
// rendering "Erreur 200" for a 200 OK response.

export type TAnalyzeNewBody = {
  ok?:         boolean
  partial?:    boolean
  retryable?:  boolean
  disabled?:   boolean
  processed?:  number
  completed?:  number
  failed?:     number
  skipped?:    number
  noOpReason?: string | null
  error?:      string
}

export type TAnalyzeKind =
  | 'success' // completed > 0, no failures
  | 'partial' // completed > 0 and some failed
  | 'retry'   // every failure was a transient Gemini error (503 / quota)
  | 'empty'   // no candidates or feature disabled
  | 'error'   // route-level failure or a non-retryable per-post failure

export type TAnalyzeFormatted = {
  kind:    TAnalyzeKind
  message: string
}

const plural = (n: number) => (n > 1 ? 's' : '')

/**
 * Map a fetch response to a UI kind + message. Always returns something
 * displayable; never produces "Erreur 200" for an HTTP 200 response.
 */
export function formatAnalyzeNewResult(
  res:  { status: number; ok: boolean },
  body: TAnalyzeNewBody | null,
): TAnalyzeFormatted {
  // Real HTTP error (auth / missing env / 500). Surface the route's error
  // string when present so the operator sees "Unauthorized" or
  // "missing_env:..." instead of an opaque status.
  if (!res.ok) {
    const detail = body?.error ?? `Erreur ${res.status}`
    return { kind: 'error', message: detail.slice(0, 160) }
  }

  // 200 with ok:false should not happen under the current API contract,
  // but if it does we refuse to render "Erreur 200" — fall back to the
  // route-supplied error string or a generic hint.
  if (!body?.ok) {
    const detail = body?.error ?? 'Réponse inattendue de l’API d’analyse'
    return { kind: 'error', message: detail.slice(0, 160) }
  }

  const completed = body.completed ?? 0
  const failed    = body.failed    ?? 0
  const processed = body.processed ?? 0

  if (body.disabled || body.noOpReason === 'content_analysis_disabled') {
    return { kind: 'empty', message: 'Analyse IA désactivée' }
  }
  if (body.noOpReason || processed === 0) {
    return { kind: 'empty', message: 'Aucun nouveau post à analyser' }
  }
  if (completed === 0 && failed > 0 && body.retryable) {
    return { kind: 'retry', message: 'Gemini indisponible · relance dans quelques minutes' }
  }
  if (completed > 0 && failed > 0) {
    return {
      kind:    'partial',
      message: `Analyse partielle · ${completed} analysé${plural(completed)}, ${failed} erreur${plural(failed)}`,
    }
  }
  if (completed === 0 && failed > 0) {
    return {
      kind:    'error',
      message: `Échec de l’analyse · ${failed} erreur${plural(failed)}`,
    }
  }
  return {
    kind:    'success',
    message: `Analyse terminée · ${completed} post${plural(completed)} analysé${plural(completed)}`,
  }
}
