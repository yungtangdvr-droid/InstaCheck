'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DealStage } from '@creator-hub/types'
import { setOpportunityStage } from '@/features/deals/actions'
import { DEAL_STAGES, DEAL_STAGE_LABEL } from '@/features/deals/utils'

type Props = {
  opportunityId: string
  stage:         DealStage
  size?:         'sm' | 'md'
}

export function StageDropdown({ opportunityId, stage, size = 'sm' }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onChange(next: DealStage) {
    if (next === stage) return
    startTransition(async () => {
      const res = await setOpportunityStage(opportunityId, next)
      if (!res.error) router.refresh()
    })
  }

  const padding = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm'

  return (
    <select
      value={stage}
      onChange={(e) => onChange(e.target.value as DealStage)}
      disabled={isPending}
      className={`rounded border border-neutral-800 bg-neutral-900 ${padding} text-neutral-200 outline-none focus:border-neutral-600 disabled:opacity-50`}
      aria-label="Changer le stage"
      onClick={(e) => e.stopPropagation()}
    >
      {DEAL_STAGES.map((s) => (
        <option key={s} value={s}>
          {DEAL_STAGE_LABEL[s]}
        </option>
      ))}
    </select>
  )
}
