'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type TIngestSummary = {
  sourcesProcessed: number
  itemsInserted:    number
  rawInserted:      number
  duplicates:       number
  skippedOld:       number
  errors:           number
  noOpReason:       string | null
}

type TScoreSummary = {
  scoreCap:       number
  candidateCount: number
  processed:      number
  completed:      number
  failed:         number
  skipped:        number
  providerCounts: { gemini: number; openai: number }
  noOpReason:     string | null
  error:          string | null
}

type TIngestResponse = {
  ok?:        boolean
  error?:     string
  ingest?:    TIngestSummary
}

type TScoreResponse = {
  ok?:      boolean
  partial?: boolean
  error?:   string
  score?:   TScoreSummary
}

type TPhase =
  | { phase: 'ingest' }
  | { phase: 'score'; current: number; total: number }

type TResult =
  | { kind: 'idle' }
  | { kind: 'refreshing'; step: TPhase }
  | { kind: 'success' | 'partial' | 'error'; message: string }

const NBSP = ' '
const MAX_SCORE_CALLS = 4

export function RefreshRadarButton() {
  const router = useRouter()
  const [result, setResult] = useState<TResult>({ kind: 'idle' })
  const [isPending, startTransition] = useTransition()

  async function trigger() {
    setResult({ kind: 'refreshing', step: { phase: 'ingest' } })

    // ----- Step 1: ingest -----
    let ingestSummary: TIngestSummary | null = null
    try {
      const res = await fetch('/api/radar/ingest-now', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
      })
      const body = await res.json().catch(() => null) as TIngestResponse | null

      if (!res.ok || !body?.ok) {
        const detail = body?.error ?? `Erreur ${res.status}`
        setResult({ kind: 'error', message: detail.slice(0, 160) })
        return
      }

      ingestSummary = body.ingest ?? null
    } catch (err) {
      setResult({
        kind:    'error',
        message: err instanceof Error ? err.message.slice(0, 160) : 'Erreur réseau',
      })
      return
    }

    // ----- Step 2: score (loop, max MAX_SCORE_CALLS) -----
    const scoreTotals = {
      calls:          0,
      candidateCount: 0,
      processed:      0,
      completed:      0,
      failed:         0,
      skipped:        0,
    }
    let scoreError: string | null = null
    let scorePartial = false

    for (let i = 0; i < MAX_SCORE_CALLS; i++) {
      setResult({
        kind: 'refreshing',
        step: { phase: 'score', current: i + 1, total: MAX_SCORE_CALLS },
      })
      let body: TScoreResponse | null = null
      let res: Response
      try {
        res = await fetch('/api/radar/score-new', {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
        })
        body = await res.json().catch(() => null) as TScoreResponse | null
      } catch (err) {
        scoreError = err instanceof Error ? err.message : 'Erreur réseau'
        break
      }

      if (!res.ok || !body?.ok) {
        scoreError = (body?.error ?? `Erreur ${res.status}`).slice(0, 160)
        break
      }

      scoreTotals.calls++
      const s = body.score
      if (s) {
        scoreTotals.candidateCount += s.candidateCount
        scoreTotals.processed      += s.processed
        scoreTotals.completed      += s.completed
        scoreTotals.failed         += s.failed
        scoreTotals.skipped        += s.skipped
        if (body.partial) scorePartial = true

        // Early stop: nothing scored or no candidates left in the window.
        if (s.processed === 0 || s.candidateCount === 0) break
      } else {
        break
      }
    }

    setResult(formatSuccess({
      ingest:       ingestSummary,
      scoreTotals,
      scoreError,
      scorePartial,
    }))
    startTransition(() => router.refresh())
  }

  const isLoading = result.kind === 'refreshing' || isPending
  const label =
    result.kind === 'refreshing' && result.step.phase === 'ingest'
      ? 'Sync RSS…'
    : result.kind === 'refreshing' && result.step.phase === 'score'
      ? `Analyse ${result.step.current}/${result.step.total}…`
    : isPending
      ? 'Mise à jour…'
    :   'Refresh Radar'

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={trigger}
        disabled={isLoading}
        aria-busy={isLoading}
        title="Ingest RSS puis scoring des nouveaux items (5 par chunk, max 4 chunks)."
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-primary text-primary-foreground px-2.5 py-1 text-xs font-medium transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading && (
          <span
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-success"
            aria-hidden
          />
        )}
        {label}
      </button>
      {result.kind === 'idle' && (
        <span className="text-[10px] text-muted-foreground">
          Ingest RSS puis scoring · 5 / chunk · max 4 chunks
        </span>
      )}
      {result.kind === 'refreshing' && (
        <span className="text-[10px] text-muted-foreground">
          {result.step.phase === 'ingest'
            ? `Sync RSS en cours…`
            : `Analyse ${result.step.current}/${result.step.total} · max ${MAX_SCORE_CALLS} chunks`}
          {' · peut prendre 1 à 2'}{NBSP}min
        </span>
      )}
      {result.kind === 'success' && (
        <span className="max-w-[18rem] text-right text-[10px] text-success">
          {result.message}
        </span>
      )}
      {result.kind === 'partial' && (
        <span className="max-w-[18rem] text-right text-[10px] text-warning">
          {result.message}
        </span>
      )}
      {result.kind === 'error' && (
        <span className="max-w-[18rem] text-right text-[10px] text-danger">
          {result.message}
        </span>
      )}
    </div>
  )
}

function formatSuccess(args: {
  ingest:       TIngestSummary | null
  scoreTotals:  { calls: number; candidateCount: number; processed: number; completed: number; failed: number; skipped: number }
  scoreError:   string | null
  scorePartial: boolean
}): TResult {
  const { ingest, scoreTotals, scoreError, scorePartial } = args

  const sources    = ingest?.sourcesProcessed ?? 0
  const inserted   = ingest?.itemsInserted    ?? 0
  const ingestErrs = ingest?.errors           ?? 0

  const summary =
    `${sources} source${plural(sources)} · ${inserted} item${plural(inserted)} ingéré${plural(inserted)} · ` +
    `${scoreTotals.completed} scoré${plural(scoreTotals.completed)} (${scoreTotals.calls} chunk${plural(scoreTotals.calls)})` +
    (scoreTotals.failed > 0 ? `, ${scoreTotals.failed} échec${plural(scoreTotals.failed)}` : '') +
    (scoreError ? ` — score: ${scoreError}` : '')

  if (scoreError || scorePartial || ingestErrs > 0 || scoreTotals.failed > 0) {
    return { kind: 'partial', message: summary.slice(0, 240) }
  }
  return { kind: 'success', message: summary.slice(0, 240) }
}

function plural(n: number): string {
  return n > 1 ? 's' : ''
}
