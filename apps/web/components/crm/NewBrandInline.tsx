'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrand } from '@/features/crm/actions'
import { BRAND_STATUSES, BRAND_STATUS_LABEL } from '@/features/crm/utils'
import type { BrandStatus } from '@creator-hub/types'

export function NewBrandInline() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [status, setStatus] = useState<BrandStatus>('cold')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function reset() {
    setName('')
    setStatus('cold')
    setError(null)
  }

  function submit() {
    if (!name.trim()) return
    startTransition(async () => {
      const res = await createBrand({ name, status })
      if (res.error || !res.data) {
        setError(res.error ?? 'Unknown error')
        return
      }
      reset()
      setOpen(false)
      router.push(`/crm/brands/${res.data.id}`)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
      >
        + Nouvelle brand
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Nom de la brand"
        disabled={isPending}
        className="min-w-[12rem] flex-1 rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
      />
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as BrandStatus)}
        disabled={isPending}
        className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
      >
        {BRAND_STATUSES.map((s) => (
          <option key={s} value={s}>{BRAND_STATUS_LABEL[s]}</option>
        ))}
      </select>
      <button
        onClick={submit}
        disabled={isPending || !name.trim()}
        className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
      >
        Créer
      </button>
      <button
        onClick={() => { reset(); setOpen(false) }}
        disabled={isPending}
        className="rounded px-2 py-1.5 text-sm text-neutral-400 transition-colors hover:text-white disabled:opacity-50"
      >
        Annuler
      </button>
      {error && <p className="w-full text-xs text-red-400">{error}</p>}
    </div>
  )
}
