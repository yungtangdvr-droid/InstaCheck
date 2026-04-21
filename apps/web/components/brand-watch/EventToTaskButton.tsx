'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTaskFromEvent } from '@/features/brand-watch/actions'

type Props = {
  brandId:     string
  watchlistId: string
  eventUrl:    string
  label?:      string | null
}

export function EventToTaskButton({ brandId, watchlistId, eventUrl, label }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'created' | 'deduped' | 'error'>('idle')
  const [error,  setError]  = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onClick() {
    setError(null)
    startTransition(async () => {
      const res = await createTaskFromEvent({ brandId, watchlistId, eventUrl, label })
      if (res.error || !res.data) {
        setStatus('error')
        setError(res.error ?? 'Unknown error')
        return
      }
      setStatus(res.data.deduped ? 'deduped' : 'created')
      router.refresh()
    })
  }

  if (status === 'created') {
    return <span className="text-xs text-emerald-300">Tâche créée</span>
  }
  if (status === 'deduped') {
    return <span className="text-xs text-neutral-400">Déjà créée (24h)</span>
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={isPending}
        className="rounded bg-white px-2.5 py-1 text-xs font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
      >
        Créer tâche
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}
