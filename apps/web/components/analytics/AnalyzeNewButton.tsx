'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Status = 'idle' | 'analyzing' | 'success' | 'partial' | 'retry' | 'empty' | 'error'

type AnalyzeResponse = {
  ok?:          boolean
  partial?:     boolean
  retryable?:   boolean
  disabled?:    boolean
  processed?:   number
  completed?:   number
  failed?:      number
  skipped?:     number
  noOpReason?:  string | null
  error?:       string
}

type Variant = 'default' | 'compact'

export function AnalyzeNewButton({
  variant = 'default',
  pendingCount,
}: {
  variant?:      Variant
  pendingCount?: number
}) {
  const router = useRouter()
  const [status,  setStatus]  = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function trigger() {
    setStatus('analyzing')
    setMessage(null)

    try {
      const res = await fetch('/api/content/analyze-new', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
      })
      const body = await res.json().catch(() => null) as AnalyzeResponse | null

      // ok:false is reserved for route-level fatal errors (auth, missing env,
      // unhandled exception). Per-post Gemini failures come back as ok:true
      // with partial/retryable flags so we never display "Erreur 200".
      if (!res.ok || !body?.ok) {
        const detail = body?.error ?? `Erreur ${res.status}`
        setStatus('error')
        setMessage(detail.slice(0, 160))
        return
      }

      const completed = body.completed ?? 0
      const failed    = body.failed    ?? 0
      const processed = body.processed ?? 0
      const plural    = (n: number) => (n > 1 ? 's' : '')

      if (body.disabled || body.noOpReason === 'content_analysis_disabled') {
        setStatus('empty')
        setMessage('Analyse IA désactivée')
      } else if (body.noOpReason || processed === 0) {
        setStatus('empty')
        setMessage('Aucun nouveau post à analyser')
      } else if (completed === 0 && failed > 0 && body.retryable) {
        setStatus('retry')
        setMessage('Gemini indisponible · relance dans quelques minutes')
      } else if (completed > 0 && failed > 0) {
        setStatus('partial')
        setMessage(
          `Analyse partielle · ${completed} analysé${plural(completed)}, ${failed} erreur${plural(failed)}`,
        )
      } else if (completed === 0 && failed > 0) {
        setStatus('error')
        setMessage(`Échec de l’analyse · ${failed} erreur${plural(failed)}`)
      } else {
        setStatus('success')
        setMessage(`Analyse terminée · ${completed} post${plural(completed)} analysé${plural(completed)}`)
      }

      startTransition(() => router.refresh())
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message.slice(0, 160) : 'Erreur réseau')
    }
  }

  const isLoading = status === 'analyzing' || isPending
  const isResolved =
    status === 'success' ||
    status === 'partial' ||
    status === 'retry'   ||
    status === 'empty'   ||
    status === 'error'
  const fullLabel =
    status === 'analyzing' ? 'Analyse IA en cours…' :
    isPending              ? 'Mise à jour…' :
    isResolved             ? 'Relancer l’analyse IA' :
                             'Analyser les nouveaux posts'
  const compactLabel =
    status === 'analyzing' ? 'Analyse IA…' :
    isPending              ? 'Mise à jour…' :
    isResolved             ? 'Relancer IA' :
                             'Analyse IA'
  const label = variant === 'compact' ? compactLabel : fullLabel

  const showPendingHint =
    status === 'idle' && typeof pendingCount === 'number'
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
      {status === 'analyzing' && (
        <span className="text-[10px] text-neutral-500">Peut prendre 1 min</span>
      )}
      {status === 'success' && message && (
        <span className="text-[10px] text-emerald-400">{message}</span>
      )}
      {status === 'partial' && message && (
        <span className="max-w-[14rem] text-right text-[10px] text-amber-400">
          {message}
        </span>
      )}
      {status === 'retry' && message && (
        <span className="max-w-[14rem] text-right text-[10px] text-amber-400">
          {message}
        </span>
      )}
      {status === 'empty' && message && (
        <span className="text-[10px] text-neutral-500">{message}</span>
      )}
      {status === 'error' && message && (
        <span className="max-w-[14rem] text-right text-[10px] text-red-400">
          {message}
        </span>
      )}
    </div>
  )
}
