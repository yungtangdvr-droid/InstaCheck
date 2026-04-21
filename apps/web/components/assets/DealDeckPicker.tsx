'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AssetType } from '@creator-hub/types'
import { updateOpportunity } from '@/features/deals/actions'
import { ASSET_TYPE_LABEL } from '@/features/assets/utils'

type AssetOption = { id: string; name: string; type: AssetType }

type Props = {
  opportunityId:  string
  currentDeckId?: string
  assetOptions:   AssetOption[]
}

export function DealDeckPicker({ opportunityId, currentDeckId, assetOptions }: Props) {
  const router = useRouter()
  const [deckId, setDeckId] = useState(currentDeckId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onChange(next: string) {
    setDeckId(next)
    setError(null)
    startTransition(async () => {
      const res = await updateOpportunity(opportunityId, { deckId: next || undefined })
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm">
      <p className="text-xs uppercase tracking-wide text-neutral-500">Deck lié</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={deckId}
          onChange={(e) => onChange(e.target.value)}
          disabled={isPending}
          className="min-w-[18rem] rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        >
          <option value="">— Aucun —</option>
          {assetOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {ASSET_TYPE_LABEL[a.type]}
            </option>
          ))}
        </select>
        {isPending && <span className="text-xs text-neutral-500">Mise à jour…</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  )
}
