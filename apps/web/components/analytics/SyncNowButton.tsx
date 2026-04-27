'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Status = 'idle' | 'loading' | 'success' | 'error'

const NBSP = ' '

export function SyncNowButton() {
  const router = useRouter()
  const [status,  setStatus]  = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function trigger() {
    setStatus('loading')
    setMessage(null)

    try {
      const res = await fetch('/api/meta/sync-now', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
      })

      const body = await res.json().catch(() => null) as
        | { ok?: boolean; error?: string; message?: string; durationMs?: number; errors?: string[] }
        | null

      if (!res.ok || !body?.ok) {
        const detail =
          body?.message
          ?? body?.error
          ?? `Erreur ${res.status}`
        setStatus('error')
        setMessage(detail)
        return
      }

      const seconds = body.durationMs ? Math.round(body.durationMs / 1000) : null
      setStatus('success')
      setMessage(seconds != null ? `Sync terminée en ${seconds}${NBSP}s` : 'Sync terminée')

      // Pull fresh server data into the page (Data Health, charts, etc.).
      startTransition(() => router.refresh())
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Erreur réseau')
    }
  }

  const isLoading = status === 'loading' || isPending
  const label =
    status === 'loading' ? 'Synchronisation en cours…' :
    isPending            ? 'Mise à jour…' :
    status === 'success' ? 'Resynchroniser' :
                           'Synchroniser maintenant'

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={trigger}
        disabled={isLoading}
        aria-busy={isLoading}
        title="Lance une synchronisation Meta complète. Peut prendre 1 à 3 minutes."
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
          1 à 3{NBSP}min · ne ferme pas l&apos;onglet
        </span>
      )}
      {status === 'loading' && (
        <span className="text-[10px] text-neutral-500">
          Peut prendre 1 à 3{NBSP}min · garde l&apos;onglet ouvert
        </span>
      )}
      {status === 'success' && message && (
        <span className="text-[10px] text-emerald-400">{message}</span>
      )}
      {status === 'error' && message && (
        <span className="max-w-[14rem] text-right text-[10px] text-red-400">
          {message.slice(0, 160)}
        </span>
      )}
    </div>
  )
}
