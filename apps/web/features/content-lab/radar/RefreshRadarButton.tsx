'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type TIngestBody = {
  ok?:        boolean
  partial?:   boolean
  error?:     string
  durationMs?:number
  ingest?: {
    sourcesProcessed: number
    itemsInserted:    number
    rawInserted:      number
    duplicates:       number
    skippedOld:       number
    errors:           number
    noOpReason:       string | null
  }
}

type TScoreBody = {
  ok?:        boolean
  partial?:   boolean
  error?:     string
  durationMs?:number
  score?: {
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
}

type TPhase =
  | { kind: 'idle' }
  | { kind: 'ingest' }
  | { kind: 'score';   index: number; total: number }

type TResult =
  | { kind: 'idle' }
  | { kind: 'success' | 'partial' | 'error'; message: string }

const NBSP = ' '
const SCORE_BATCH_LIMIT = 4

export function RefreshRadarButton() {
  const router = useRouter()
  const [phase,  setPhase]  = useState<TPhase>({ kind: 'idle' })
  const [result, setResult] = useState<TResult>({ kind: 'idle' })
  const [isPending, startTransition] = useTransition()

  async function trigger() {
    setResult({ kind: 'idle' })
    setPhase({ kind: 'ingest' })

    let ingestBody: TIngestBody | null = null
    try {
      const res = await fetch('/api/radar/ingest-now', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
      })
      ingestBody = await res.json().catch(() => null) as TIngestBody | null

      if (!res.ok || !ingestBody?.ok) {
        const detail = ingestBody?.error ?? `Erreur ${res.status}`
        setPhase({ kind: 'idle' })
        setResult({ kind: 'error', message: detail.slice(0, 160) })
        return
      }
    } catch (err) {
      setPhase({ kind: 'idle' })
      setResult({
        kind:    'error',
        message: err instanceof Error ? err.message.slice(0, 160) : 'Erreur réseau',
      })
      return
    }

    let totals = {
      candidateCount: 0,
      processed:      0,
      completed:      0,
      failed:         0,
      skipped:        0,
      batches:        0,
      scoreError:     null as string | null,
      partial:        false,
    }

    for (let i = 1; i <= SCORE_BATCH_LIMIT; i++) {
      setPhase({ kind: 'score', index: i, total: SCORE_BATCH_LIMIT })

      let body: TScoreBody | null = null
      try {
        const res = await fetch('/api/radar/score-new', {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
        })
        body = await res.json().catch(() => null) as TScoreBody | null

        if (!res.ok || !body?.ok) {
          totals.scoreError = (body?.error ?? `Erreur ${res.status}`).slice(0, 160)
          totals.partial    = true
          break
        }
      } catch (err) {
        totals.scoreError = err instanceof Error ? err.message.slice(0, 160) : 'Erreur réseau'
        totals.partial    = true
        break
      }

      const s = body.score
      if (!s) {
        totals.scoreError = 'score_missing'
        totals.partial    = true
        break
      }

      totals.batches        += 1
      totals.candidateCount += s.candidateCount
      totals.processed      += s.processed
      totals.completed      += s.completed
      totals.failed         += s.failed
      totals.skipped        += s.skipped
      if (s.failed > 0 || body.partial || s.error) totals.partial = true

      if (s.processed === 0 || s.candidateCount === 0) break
    }

    setPhase({ kind: 'idle' })
    setResult(formatSummary(ingestBody, totals))
    startTransition(() => router.refresh())
  }

  const isLoading = phase.kind !== 'idle' || isPending
  const label =
    phase.kind === 'ingest' ? 'Sync RSS…' :
    phase.kind === 'score'  ? `Analyse ${phase.index}/${phase.total}…` :
    isPending               ? 'Mise à jour…' :
                              'Refresh Radar'

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={trigger}
        disabled={isLoading}
        aria-busy={isLoading}
        title="Ingest RSS puis scoring des nouveaux items (max 4 × 5 par clic)."
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
      {result.kind === 'idle' && phase.kind === 'idle' && (
        <span className="text-[10px] text-muted-foreground">
          Ingest RSS puis scoring · max 4{NBSP}×{NBSP}5 / clic
        </span>
      )}
      {phase.kind !== 'idle' && (
        <span className="text-[10px] text-muted-foreground">
          Lots courts pour éviter les timeouts
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

function formatSummary(
  ingestBody: TIngestBody | null,
  totals: {
    candidateCount: number
    processed:      number
    completed:      number
    failed:         number
    skipped:        number
    batches:        number
    scoreError:     string | null
    partial:        boolean
  },
): TResult {
  const ingest = ingestBody?.ingest
  const sources    = ingest?.sourcesProcessed ?? 0
  const inserted   = ingest?.itemsInserted    ?? 0
  const ingestErrs = ingest?.errors           ?? 0

  const summary =
    `${sources} source${plural(sources)} · ${inserted} item${plural(inserted)} ingéré${plural(inserted)} · ` +
    `${totals.completed} scoré${plural(totals.completed)}` +
    (totals.failed > 0 ? `, ${totals.failed} échec${plural(totals.failed)}` : '') +
    (totals.scoreError ? ` · scoring interrompu` : '')

  const isPartial =
    totals.partial ||
    ingestErrs > 0 ||
    Boolean(ingestBody?.partial) ||
    totals.failed > 0 ||
    Boolean(totals.scoreError)

  if (isPartial) return { kind: 'partial', message: summary }
  return { kind: 'success', message: summary }
}

function plural(n: number): string {
  return n > 1 ? 's' : ''
}
