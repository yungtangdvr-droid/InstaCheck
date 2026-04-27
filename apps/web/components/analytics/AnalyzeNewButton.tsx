'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  formatAnalyzeNewResult,
  type TAnalyzeKind,
  type TAnalyzeNewBody,
} from './format-analyze-result'

// Single state machine for the button so a stale error message can never
// outlive the next click. Setting `result` overwrites both kind and message
// in one update — no chance of `status='analyzing'` with the old error
// string still bound to the DOM.
type TResult =
  | { kind: 'idle' }
  | { kind: 'analyzing' }
  | { kind: TAnalyzeKind; message: string }

type Variant = 'default' | 'compact'

export function AnalyzeNewButton({
  variant = 'default',
  pendingCount,
}: {
  variant?:      Variant
  pendingCount?: number
}) {
  const router = useRouter()
  const [result, setResult] = useState<TResult>({ kind: 'idle' })
  const [isPending, startTransition] = useTransition()

  async function trigger() {
    // Hard reset before the network call so any previous error/partial
    // hint disappears immediately while the new request is in flight.
    setResult({ kind: 'analyzing' })

    try {
      const res = await fetch('/api/content/analyze-new', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
      })
      const body = await res.json().catch(() => null) as TAnalyzeNewBody | null

      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[AnalyzeNewButton] /api/content/analyze-new', {
          httpStatus: res.status,
          httpOk:     res.ok,
          ok:         body?.ok,
          partial:    body?.partial,
          retryable:  body?.retryable,
          processed:  body?.processed,
          completed:  body?.completed,
          failed:     body?.failed,
          skipped:    body?.skipped,
          noOpReason: body?.noOpReason,
        })
      }

      const formatted = formatAnalyzeNewResult(
        { status: res.status, ok: res.ok },
        body,
      )
      setResult({ kind: formatted.kind, message: formatted.message })

      // Pull fresh server data (Data Health, posts list) regardless of the
      // outcome — even a no-op should refresh "last analyzed at" hints.
      startTransition(() => router.refresh())
    } catch (err) {
      setResult({
        kind:    'error',
        message: err instanceof Error ? err.message.slice(0, 160) : 'Erreur réseau',
      })
    }
  }

  const isLoading  = result.kind === 'analyzing' || isPending
  const isResolved =
    result.kind === 'success' ||
    result.kind === 'partial' ||
    result.kind === 'retry'   ||
    result.kind === 'empty'   ||
    result.kind === 'error'

  const fullLabel =
    result.kind === 'analyzing' ? 'Analyse IA en cours…' :
    isPending                   ? 'Mise à jour…' :
    isResolved                  ? 'Relancer l’analyse IA' :
                                  'Analyser les nouveaux posts'
  const compactLabel =
    result.kind === 'analyzing' ? 'Analyse IA…' :
    isPending                   ? 'Mise à jour…' :
    isResolved                  ? 'Relancer IA' :
                                  'Analyse IA'
  const label = variant === 'compact' ? compactLabel : fullLabel

  const showPendingHint =
    result.kind === 'idle' && typeof pendingCount === 'number'
  const pendingHint =
    pendingCount === 0
      ? 'Aucun post en attente'
      : pendingCount === 1
        ? '1 post à analyser'
        : `${pendingCount} posts à analyser`

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={trigger}
        disabled={isLoading}
        aria-busy={isLoading}
        title="Lance Gemini sur les posts déjà synchronisés sans analyse de contenu. Ne relance pas la sync Instagram."
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading && (
          <span
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-400"
            aria-hidden
          />
        )}
        {label}
      </button>
      {showPendingHint && (
        <span className="text-[10px] text-neutral-600">{pendingHint}</span>
      )}
      {result.kind === 'analyzing' && (
        <span className="text-[10px] text-neutral-500">Peut prendre 1 min</span>
      )}
      {result.kind === 'success' && (
        <span className="text-[10px] text-emerald-400">{result.message}</span>
      )}
      {(result.kind === 'partial' || result.kind === 'retry') && (
        <span className="max-w-[14rem] text-right text-[10px] text-amber-400">
          {result.message}
        </span>
      )}
      {result.kind === 'empty' && (
        <span className="text-[10px] text-neutral-500">{result.message}</span>
      )}
      {result.kind === 'error' && (
        <span className="max-w-[14rem] text-right text-[10px] text-red-400">
          {result.message}
        </span>
      )}
    </div>
  )
}
