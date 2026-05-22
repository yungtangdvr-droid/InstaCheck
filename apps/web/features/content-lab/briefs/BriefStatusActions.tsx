'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import type { MemeBriefStatus } from '@creator-hub/types'

import { setBriefStatus } from './actions'

interface Props {
  briefId: string
  status:  MemeBriefStatus
  compact?: boolean
}

const NEXT_STATUSES: MemeBriefStatus[] = ['draft', 'kept', 'discarded', 'shipped']

const LABEL: Record<MemeBriefStatus, string> = {
  draft:     'Draft',
  kept:      'Keep',
  discarded: 'Discard',
  shipped:   'Shipped',
}

export function BriefStatusActions({ briefId, status, compact = false }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handle(next: MemeBriefStatus) {
    setError(null)
    startTransition(async () => {
      const result = await setBriefStatus(briefId, next)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {NEXT_STATUSES.map((s) => {
          const active = s === status
          return (
            <Button
              key={s}
              variant={active ? 'default' : 'outline'}
              size={compact ? 'sm' : 'default'}
              disabled={isPending || active}
              onClick={() => handle(s)}
            >
              {LABEL[s]}
            </Button>
          )
        })}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  )
}
