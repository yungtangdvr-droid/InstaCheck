'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TouchpointType } from '@creator-hub/types'
import { createTouchpoint } from '@/features/crm/actions'
import { TOUCHPOINT_LABEL, TOUCHPOINT_TYPES } from '@/features/crm/utils'

type Props = {
  brandId?:   string
  contactId?: string
}

export function TouchpointComposer({ brandId, contactId }: Props) {
  const router = useRouter()
  const [type, setType] = useState<TouchpointType>('email')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await createTouchpoint({ type, note, brandId, contactId })
      if (res.error) {
        setError(res.error)
        return
      }
      setNote('')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">Type</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TouchpointType)}
          disabled={isPending}
          className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        >
          {TOUCHPOINT_TYPES.map((t) => (
            <option key={t} value={t}>{TOUCHPOINT_LABEL[t]}</option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
        <span className="text-xs text-neutral-500">Note</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Objet / résumé"
          disabled={isPending}
          className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        />
      </label>
      <button
        onClick={submit}
        disabled={isPending}
        className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
      >
        Ajouter
      </button>
      {error && <p className="w-full text-xs text-red-400">{error}</p>}
    </div>
  )
}
