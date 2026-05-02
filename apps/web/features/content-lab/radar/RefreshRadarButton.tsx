'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type TRefreshBody = {
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

type TResult =
  | { kind: 'idle' }
  | { kind: 'refreshing' }
  | { kind: 'success' | 'partial' | 'error'; message: string }

const NBSP = ' '

export function RefreshRadarButton() {
  const router = useRouter()
  const [result, setResult] = useState<TResult>({ kind: 'idle' })
  const [isPending, startTransition] = useTransition()

  async function trigger() {
    setResult({ kind: 'refreshing' })

    try {
      const res = await fetch('/api/radar/refresh', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
      })
      const body = await res.json().catch(() => null) as TRefreshBody | null

      if (!res.ok || !body?.ok) {
        const detail = body?.error ?? `Erreur ${res.status}`
        setResult({ kind: 'error', message: detail.slice(0, 160) })
        return
      }

      setResult(formatSuccess(body))
      startTransition(() => router.refresh())
    } catch (err) {
      setResult({
        kind:    'error',
        message: err instanceof Error ? err.message.slice(0, 160) : 'Erreur réseau',
      })
    }
  }

  const isLoading = result.kind === 'refreshing' || isPending
  const label =
    result.kind === 'refreshing' ? `Refresh en cours…` :
    isPending                    ? 'Mise à jour…' :
                                   'Refresh Radar'

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={trigger}
        disabled={isLoading}
        aria-busy={isLoading}
        title="Ingest RSS puis scoring des nouveaux items (max 20 par clic)."
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
          Ingest RSS puis scoring · max 20 / clic
        </span>
      )}
      {result.kind === 'refreshing' && (
        <span className="text-[10px] text-muted-foreground">
          Peut prendre 1 à 2{NBSP}min
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

function formatSuccess(body: TRefreshBody): TResult {
  const ingest = body.ingest
  const score  = body.score
  const sources    = ingest?.sourcesProcessed ?? 0
  const inserted   = ingest?.itemsInserted    ?? 0
  const ingestErrs = ingest?.errors           ?? 0
  const completed  = score?.completed         ?? 0
  const failed     = score?.failed            ?? 0

  const summary =
    `${sources} source${plural(sources)} · ${inserted} item${plural(inserted)} ingéré${plural(inserted)} · ` +
    `${completed} scoré${plural(completed)}` +
    (failed > 0 ? `, ${failed} échec${plural(failed)}` : '')

  if (body.partial || ingestErrs > 0 || failed > 0 || score?.error) {
    return { kind: 'partial', message: summary }
  }
  return { kind: 'success', message: summary }
}

function plural(n: number): string {
  return n > 1 ? 's' : ''
}
