'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Status = 'idle' | 'analyzing' | 'success' | 'empty' | 'error'

type AnalyzeResponse = {
  ok?:          boolean
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

      if (!res.ok || !body?.ok) {
        const detail = body?.error ?? `Erreur ${res.status}`
        setStatus('error')
        setMessage(detail.slice(0, 160))
        return
      }

      if (body.disabled || body.noOpReason === 'content_analysis_disabled') {
        setStatus('empty')
        setMessage('Analyse IA désactivée')
      } else if (body.noOpReason === 'no_new_posts_to_analyze' || (body.processed ?? 0) === 0) {
        setStatus('empty')
        setMessage('Aucun nouveau post à analyser')
      } else {
        const completed = body.completed ?? 0
        const plural = completed > 1 ? 's' : ''
        setStatus('success')
        setMessage(`Analyse terminée · ${completed} post${plural} analysé${plural}`)
      }

      startTransition(() => router.refresh())
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message.slice(0, 160) : 'Erreur réseau')
    }
  }

  const isLoading = status === 'analyzing' || isPending
  const fullLabel =
    status === 'analyzing' ? 'Analyse IA en cours…' :
    isPending              ? 'Mise à jour…' :
    status === 'success' || status === 'empty' || status === 'error' ? 'Relancer l’analyse IA' :
                             'Analyser les nouveaux posts'
  const compactLabel =
    status === 'analyzing' ? 'Analyse IA…' :
    isPending              ? 'Mise à jour…' :
    status === 'success' || status === 'empty' || status === 'error' ? 'Relancer IA' :
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
