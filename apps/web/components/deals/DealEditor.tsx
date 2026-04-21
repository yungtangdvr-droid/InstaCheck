'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Opportunity } from '@creator-hub/types'
import { deleteOpportunity, updateOpportunity } from '@/features/deals/actions'

type BrandOption = { id: string; name: string }

type Props = {
  opportunity:  Opportunity
  brandOptions: BrandOption[]
}

export function DealEditor({ opportunity, brandOptions }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName]                       = useState(opportunity.name)
  const [brandId, setBrandId]                 = useState(opportunity.brandId ?? '')
  const [collabType, setCollabType]           = useState(opportunity.collabType ?? '')
  const [estimatedValue, setEstimatedValue]   = useState(
    opportunity.estimatedValue !== undefined ? String(opportunity.estimatedValue) : '',
  )
  const [currency, setCurrency]               = useState(opportunity.currency)
  const [probability, setProbability]         = useState(String(opportunity.probability))
  const [expectedCloseAt, setExpectedCloseAt] = useState(
    opportunity.expectedCloseAt ? opportunity.expectedCloseAt.slice(0, 10) : '',
  )
  const [nextAction, setNextAction]           = useState(opportunity.nextAction ?? '')

  function save() {
    setError(null)
    const parsedValue =
      estimatedValue.trim() === '' ? undefined : Number(estimatedValue)
    if (parsedValue !== undefined && Number.isNaN(parsedValue)) {
      setError('Valeur estimée invalide')
      return
    }
    const parsedProb = Number(probability)
    if (Number.isNaN(parsedProb) || parsedProb < 0 || parsedProb > 100) {
      setError('Probabilité entre 0 et 100')
      return
    }

    startTransition(async () => {
      const res = await updateOpportunity(opportunity.id, {
        name,
        brandId:         brandId || undefined,
        collabType,
        estimatedValue:  parsedValue,
        currency,
        probability:     parsedProb,
        expectedCloseAt: expectedCloseAt || undefined,
        nextAction,
      })
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function remove() {
    if (!confirm('Supprimer cette opportunité ?')) return
    startTransition(async () => {
      await deleteOpportunity(opportunity.id)
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

        <Field label="Brand">
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            disabled={isPending}
            className={inputClass}
          >
            <option value="">—</option>
            {brandOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Type de collab">
          <input
            type="text"
            value={collabType}
            onChange={(e) => setCollabType(e.target.value)}
            disabled={isPending}
            className={inputClass}
            placeholder="Reel sponsorisé, campagne annuelle…"
          />
        </Field>

        <Field label="Prochaine action">
          <input
            type="text"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            disabled={isPending}
            className={inputClass}
            placeholder="Relancer Marie le 25/04"
          />
        </Field>

        <Field label="Valeur estimée">
          <input
            type="number"
            inputMode="decimal"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
            disabled={isPending}
            className={inputClass}
            placeholder="5000"
          />
        </Field>

        <Field label="Devise">
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            disabled={isPending}
            className={inputClass}
            maxLength={4}
          />
        </Field>

        <Field label="Probabilité (%)">
          <input
            type="number"
            min={0}
            max={100}
            value={probability}
            onChange={(e) => setProbability(e.target.value)}
            disabled={isPending}
            className={inputClass}
          />
        </Field>

        <Field label="Date cible">
          <input
            type="date"
            value={expectedCloseAt}
            onChange={(e) => setExpectedCloseAt(e.target.value)}
            disabled={isPending}
            className={inputClass}
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
