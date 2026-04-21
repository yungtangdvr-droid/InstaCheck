'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AttributionRule } from '@creator-hub/types'
import { deleteRule, toggleRule } from '@/features/attribution/actions'
import {
  ATTRIBUTION_MATCH_BADGE,
  ATTRIBUTION_MATCH_TYPE_LABEL,
  ATTRIBUTION_TARGET_TYPE_LABEL,
} from '@/features/attribution/utils'

export function AttributionRuleRow({
  rule,
  targetName,
}: {
  rule:       AttributionRule
  targetName: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onToggle() {
    startTransition(async () => {
      await toggleRule(rule.id, !rule.active)
      router.refresh()
    })
  }

  function onDelete() {
    if (!confirm(`Supprimer la règle « ${rule.label} » ?`)) return
    startTransition(async () => {
      await deleteRule(rule.id)
      router.refresh()
    })
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm ${
        rule.active ? '' : 'opacity-60'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-white">{rule.label}</span>
          <span className={`rounded px-2 py-0.5 text-xs ${ATTRIBUTION_MATCH_BADGE[rule.matchType]}`}>
            {ATTRIBUTION_MATCH_TYPE_LABEL[rule.matchType]}
          </span>
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
            {ATTRIBUTION_TARGET_TYPE_LABEL[rule.targetType]} · {targetName ?? '—'}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-neutral-500" title={rule.pattern}>
          <span className="text-neutral-600">pattern:</span> {rule.pattern}
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs text-neutral-400">
        <span>Priorité {rule.priority}</span>
        <button
          onClick={onToggle}
          disabled={isPending}
          className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white disabled:opacity-50"
        >
          {rule.active ? 'Désactiver' : 'Activer'}
        </button>
        <button
          onClick={onDelete}
          disabled={isPending}
          className="rounded border border-red-900/50 px-2 py-1 text-red-300 transition-colors hover:border-red-700 hover:text-red-200 disabled:opacity-50"
        >
          Supprimer
        </button>
      </div>
    </div>
  )
}
