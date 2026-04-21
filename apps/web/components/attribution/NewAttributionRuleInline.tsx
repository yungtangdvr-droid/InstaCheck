'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type {
  AttributionMatchType,
  AttributionTargetType,
} from '@creator-hub/types'
import { createRule } from '@/features/attribution/actions'
import {
  ATTRIBUTION_MATCH_TYPES,
  ATTRIBUTION_MATCH_TYPE_LABEL,
  ATTRIBUTION_TARGET_TYPES,
  ATTRIBUTION_TARGET_TYPE_LABEL,
} from '@/features/attribution/utils'

type Option = { id: string; name: string }

export function NewAttributionRuleInline({
  opportunityOptions,
  brandOptions,
  assetOptions,
}: {
  opportunityOptions: Option[]
  brandOptions:       Option[]
  assetOptions:       Option[]
}) {
  const router = useRouter()
  const [open, setOpen]         = useState(false)
  const [label, setLabel]       = useState('')
  const [matchType, setMatchType]   = useState<AttributionMatchType>('url_pattern')
  const [pattern, setPattern]   = useState('')
  const [targetType, setTargetType] = useState<AttributionTargetType>('opportunity')
  const [targetId, setTargetId] = useState('')
  const [priority, setPriority] = useState(100)
  const [error, setError]       = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const options =
    targetType === 'opportunity' ? opportunityOptions
    : targetType === 'brand'     ? brandOptions
    : assetOptions

  function reset() {
    setLabel('')
    setMatchType('url_pattern')
    setPattern('')
    setTargetType('opportunity')
    setTargetId('')
    setPriority(100)
    setError(null)
  }

  function submit() {
    if (!label.trim() || !pattern.trim() || !targetId) return
    startTransition(async () => {
      const res = await createRule({
        label,
        matchType,
        pattern,
        targetType,
        targetId,
        priority,
        active: true,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      reset()
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
      >
        + Nouvelle règle
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
        <span className="text-xs text-neutral-500">Label</span>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={isPending}
          autoFocus
          placeholder="Ex. utm_source=newsletter"
          className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">Match</span>
        <select
          value={matchType}
          onChange={(e) => setMatchType(e.target.value as AttributionMatchType)}
          disabled={isPending}
          className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        >
          {ATTRIBUTION_MATCH_TYPES.map((m) => (
            <option key={m} value={m}>
              {ATTRIBUTION_MATCH_TYPE_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
        <span className="text-xs text-neutral-500">Pattern</span>
        <input
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          disabled={isPending}
          placeholder={matchType === 'asset_link_url' ? 'https://…' : 'substring'}
          className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">Cible</span>
        <select
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value as AttributionTargetType)
            setTargetId('')
          }}
          disabled={isPending}
          className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        >
          {ATTRIBUTION_TARGET_TYPES.map((t) => (
            <option key={t} value={t}>
              {ATTRIBUTION_TARGET_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
        <span className="text-xs text-neutral-500">{ATTRIBUTION_TARGET_TYPE_LABEL[targetType]}</span>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          disabled={isPending || options.length === 0}
          className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex w-24 flex-col gap-1">
        <span className="text-xs text-neutral-500">Priorité</span>
        <input
          type="number"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value) || 0)}
          disabled={isPending}
          className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        />
      </label>
      <button
        onClick={submit}
        disabled={isPending || !label.trim() || !pattern.trim() || !targetId}
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
