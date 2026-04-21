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
    <div className="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 p-0.5">
      {PERIODS.map(({ value: v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            value === v
              ? 'bg-neutral-600 text-white shadow-sm'
              : 'text-neutral-500 hover:text-neutral-300',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
