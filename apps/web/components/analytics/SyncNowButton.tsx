'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Status = 'idle' | 'syncing' | 'analyzing' | 'success' | 'warning' | 'error'

const NBSP = ' '

type AnalyzeResponse = {
  ok?:           boolean
  disabled?:     boolean
  processed?:    number
  completed?:    number
  failed?:       number
  skipped?:      number
  noOpReason?:   string | null
  error?:        string
}

export function SyncNowButton() {
  const router = useRouter()
  const [status,  setStatus]  = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function trigger() {
    setStatus('syncing')
    setMessage(null)

    try {
      const syncRes = await fetch('/api/meta/sync-now', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
      })

      const syncBody = await syncRes.json().catch(() => null) as
        | { ok?: boolean; error?: string; message?: string; durationMs?: number; errors?: string[] }
        | null

      if (!syncRes.ok || !syncBody?.ok) {
        const detail =
          syncBody?.message
          ?? syncBody?.error
          ?? `Erreur ${syncRes.status}`
        setStatus('error')
        setMessage(detail)
        return
      }

      // Sync succeeded → chain content analysis on newly synced posts.
      // A failure here must NOT poison the sync result: surface a warning
      // and keep the page refresh.
      setStatus('analyzing')
      setMessage('Analyse des nouveaux posts…')

      let analysis: AnalyzeResponse | null = null
      let analysisFailed = false
      try {
        const aRes = await fetch('/api/content/analyze-new', {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
        })
        analysis = await aRes.json().catch(() => null) as AnalyzeResponse | null
        if (!aRes.ok || !analysis?.ok) {
          analysisFailed = true
        }
      } catch {
        analysisFailed = true
      }

      if (analysisFailed) {
        setStatus('warning')
        setMessage('Sync OK · analyse contenu à relancer')
      } else if (analysis?.disabled || analysis?.noOpReason === 'content_analysis_disabled') {
        setStatus('success')
        setMessage('Sync terminée')
      } else if (analysis?.noOpReason === 'no_new_posts_to_analyze' || (analysis?.processed ?? 0) === 0) {
        setStatus('success')
        setMessage('Sync terminée · aucun nouveau post à analyser')
      } else {
        const completed = analysis?.completed ?? 0
        const plural = completed > 1 ? 's' : ''
        setStatus('success')
        setMessage(`Sync terminée · ${completed} post${plural} analysé${plural}`)
      }

      // Pull fresh server data into the page (Data Health, charts, etc.).
      startTransition(() => router.refresh())
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Erreur réseau')
    }
  }

  const isLoading = status === 'syncing' || status === 'analyzing' || isPending
  const label =
    status === 'syncing'   ? 'Synchronisation en cours…' :
    status === 'analyzing' ? 'Analyse des nouveaux posts…' :
    isPending              ? 'Mise à jour…' :
    status === 'success' || status === 'warning' ? 'Resynchroniser' :
                             'Synchroniser maintenant'

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={trigger}
        disabled={isLoading}
        aria-busy={isLoading}
        title="Sync puis analyse des nouveaux posts. Peut prendre quelques minutes."
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading && (
          <span
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400"
            aria-hidden
          />
        )}
        {label}
      </button>
      {status === 'idle' && (
        <span className="text-[10px] text-neutral-600">
          Sync puis analyse · ne ferme pas l&apos;onglet
        </span>
      )}
      {status === 'syncing' && (
        <span className="text-[10px] text-neutral-500">
          Peut prendre 1 à 3{NBSP}min · garde l&apos;onglet ouvert
        </span>
      )}
      {status === 'analyzing' && message && (
        <span className="text-[10px] text-neutral-400">{message}</span>
      )}
      {status === 'success' && message && (
        <span className="text-[10px] text-emerald-400">{message}</span>
      )}
      {status === 'warning' && message && (
        <span className="text-[10px] text-amber-400">{message}</span>
      )}
      {status === 'error' && message && (
        <span className="max-w-[14rem] text-right text-[10px] text-red-400">
          {message.slice(0, 160)}
        </span>
      )}
    </div>
  )
}
