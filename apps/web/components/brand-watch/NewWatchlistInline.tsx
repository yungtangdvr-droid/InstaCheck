'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createWatchlist } from '@/features/brand-watch/actions'

type BrandOption = { id: string; name: string }

type Props = {
  brands:         BrandOption[]
  presetBrandId?: string       // lock brand picker (used by BrandWatchBlock)
  presetUrl?:     string       // pre-fill URL (used from "Unmatched" row)
  onCreated?:     () => void   // optional post-create hook
  buttonLabel?:   string
}

export function NewWatchlistInline({
  brands,
  presetBrandId,
  presetUrl,
  buttonLabel = '+ Surveiller une URL',
}: Props) {
  const router = useRouter()
  const [open,    setOpen]    = useState(Boolean(presetUrl))
  const [brandId, setBrandId] = useState(presetBrandId ?? brands[0]?.id ?? '')
  const [url,     setUrl]     = useState(presetUrl ?? '')
  const [label,   setLabel]   = useState('')
  const [error,   setError]   = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function reset() {
    setUrl('')
    setLabel('')
    setError(null)
    if (!presetBrandId) setBrandId(brands[0]?.id ?? '')
  }

  function submit() {
    if (!brandId || !url.trim()) return
    startTransition(async () => {
      const res = await createWatchlist({
        brandId,
        url,
        label: label || undefined,
      })
      if (res.error || !res.data) {
        setError(res.error ?? 'Unknown error')
        return
      }
      reset()
      if (!presetUrl) setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
      >
        {buttonLabel}
      </button>
    )
  }

  const brandLocked = Boolean(presetBrandId)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      {!brandLocked && (
        <select
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          disabled={isPending || brands.length === 0}
          className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        >
          {brands.length === 0 && <option value="">Aucune brand</option>}
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      )}
      <input
        autoFocus
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="https://marque.com/news"
        disabled={isPending}
        className="min-w-[18rem] flex-1 rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
      />
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Label (optionnel)"
        disabled={isPending}
        className="w-48 rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
      />
      <button
        onClick={submit}
        disabled={isPending || !brandId || !url.trim()}
        className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
      >
        Créer
      </button>
      <button
        onClick={() => { reset(); if (!presetUrl) setOpen(false) }}
        disabled={isPending}
        className="rounded px-2 py-1.5 text-sm text-neutral-400 transition-colors hover:text-white disabled:opacity-50"
      >
        Annuler
      </button>
      {error && <p className="w-full text-xs text-red-400">{error}</p>}
    </div>
  )
}
