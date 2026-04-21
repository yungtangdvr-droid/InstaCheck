'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AssetType } from '@creator-hub/types'
import { createAsset } from '@/features/assets/actions'
import { ASSET_TYPES, ASSET_TYPE_LABEL } from '@/features/assets/utils'

export function NewAssetInline() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<AssetType>('creator_deck')
  const [papermarkLinkId, setPapermarkLinkId] = useState('')
  const [papermarkLinkUrl, setPapermarkLinkUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function reset() {
    setName('')
    setType('creator_deck')
    setPapermarkLinkId('')
    setPapermarkLinkUrl('')
    setError(null)
  }

  function submit() {
    if (!name.trim()) return

    startTransition(async () => {
      const res = await createAsset({
        name,
        type,
        papermarkLinkId:  papermarkLinkId || undefined,
        papermarkLinkUrl: papermarkLinkUrl || undefined,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      reset()
      setOpen(false)
      router.refresh()
      if (res.data?.id) router.push(`/assets/${res.data.id}`)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
      >
        + Nouvel asset
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
        <span className="text-xs text-neutral-500">Nom</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          disabled={isPending}
          autoFocus
          placeholder="Creator deck 2026"
          className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">Type</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as AssetType)}
          disabled={isPending}
          className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        >
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>
              {ASSET_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">Papermark link ID</span>
        <input
          type="text"
          value={papermarkLinkId}
          onChange={(e) => setPapermarkLinkId(e.target.value)}
          disabled={isPending}
          placeholder="lnk_…"
          className="w-48 rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">Papermark URL</span>
        <input
          type="url"
          value={papermarkLinkUrl}
          onChange={(e) => setPapermarkLinkUrl(e.target.value)}
          disabled={isPending}
          placeholder="https://…"
          className="w-64 rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        />
      </label>
      <button
        onClick={submit}
        disabled={isPending || !name.trim()}
        className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
      >
        Créer
      </button>
      <button
        onClick={() => {
          reset()
          setOpen(false)
        }}
        disabled={isPending}
        className="rounded px-3 py-1.5 text-sm text-neutral-400 transition-colors hover:text-white disabled:opacity-50"
      >
        Annuler
      </button>
      {error && <p className="basis-full text-xs text-red-400">{error}</p>}
    </div>
  )
}
