'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createOpportunity } from '@/features/deals/actions'

type BrandOption = { id: string; name: string }

export function NewDealInline({ brandOptions }: { brandOptions: BrandOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [brandId, setBrandId] = useState('')
  const [estimatedValue, setEstimatedValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function reset() {
    setName('')
    setBrandId('')
    setEstimatedValue('')
    setError(null)
  }

  function submit() {
    if (!name.trim()) return
    const parsedValue =
      estimatedValue.trim() === '' ? undefined : Number(estimatedValue)
    if (parsedValue !== undefined && Number.isNaN(parsedValue)) {
      setError('Valeur estimée invalide')
      return
    }

    startTransition(async () => {
      const res = await createOpportunity({
        name,
        brandId:        brandId || undefined,
        estimatedValue: parsedValue,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      reset()
      setOpen(false)
      router.refresh()
      if (res.data?.id) router.push(`/deals/${res.data.id}`)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
      >
        + Nouvelle opportunité
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
          placeholder="Collab X — campagne été"
          className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">Brand</span>
        <select
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          disabled={isPending}
          className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        >
          <option value="">—</option>
          {brandOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">Valeur est.</span>
        <input
          type="number"
          inputMode="decimal"
          value={estimatedValue}
          onChange={(e) => setEstimatedValue(e.target.value)}
          disabled={isPending}
          placeholder="5000"
          className="w-32 rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
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
