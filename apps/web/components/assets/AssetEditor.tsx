'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Asset, AssetType } from '@creator-hub/types'
import { deleteAsset, updateAsset } from '@/features/assets/actions'
import { ASSET_TYPES, ASSET_TYPE_LABEL } from '@/features/assets/utils'

export function AssetEditor({ asset }: { asset: Asset }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName]                         = useState(asset.name)
  const [type, setType]                         = useState<AssetType>(asset.type)
  const [papermarkLinkId, setPapermarkLinkId]   = useState(asset.papermarkLinkId ?? '')
  const [papermarkLinkUrl, setPapermarkLinkUrl] = useState(asset.papermarkLinkUrl ?? '')

  function save() {
    setError(null)
    if (!name.trim()) {
      setError('Nom requis')
      return
    }

    startTransition(async () => {
      const res = await updateAsset(asset.id, {
        name,
        type,
        papermarkLinkId,
        papermarkLinkUrl,
      })
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function remove() {
    if (!confirm('Supprimer cet asset ? Les événements liés seront supprimés.')) return
    startTransition(async () => {
      await deleteAsset(asset.id)
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Nom">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            className={inputClass}
          />
        </Field>

        <Field label="Type">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AssetType)}
            disabled={isPending}
            className={inputClass}
          >
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSET_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Papermark link ID">
          <input
            type="text"
            value={papermarkLinkId}
            onChange={(e) => setPapermarkLinkId(e.target.value)}
            disabled={isPending}
            className={inputClass}
            placeholder="lnk_…"
          />
        </Field>

        <Field label="Papermark URL">
          <input
            type="url"
            value={papermarkLinkUrl}
            onChange={(e) => setPapermarkLinkUrl(e.target.value)}
            disabled={isPending}
            className={inputClass}
            placeholder="https://…"
          />
        </Field>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex justify-between pt-1">
        <button
          onClick={remove}
          disabled={isPending}
          className="rounded px-3 py-1.5 text-xs text-neutral-500 transition-colors hover:text-red-400 disabled:opacity-50"
        >
          Supprimer
        </button>
        <button
          onClick={save}
          disabled={isPending || !name.trim()}
          className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
        >
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-500">{label}</span>
      {children}
    </label>
  )
}
