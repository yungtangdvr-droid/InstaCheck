'use client'

import { cn } from '@/lib/utils'
import type { TPeriod } from '@creator-hub/types'

const PERIODS: { value: TPeriod; label: string }[] = [
  { value: 7, label: '7j' },
  { value: 30, label: '30j' },
  { value: 90, label: '90j' },
]

interface PeriodFilterProps {
  value: TPeriod
  onChange: (p: TPeriod) => void
}

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5">
      {PERIODS.map(({ value: v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            value === v
              ? 'bg-zinc-900 text-white shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
