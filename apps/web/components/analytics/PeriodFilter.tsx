'use client'
import { usePeriodFilter } from '@/hooks/use-period-filter'
import type { TAnalyticsPeriod } from '@creator-hub/types'

const OPTIONS: { value: TAnalyticsPeriod; label: string }[] = [
  { value: 7,  label: '7j' },
  { value: 30, label: '30j' },
  { value: 90, label: '90j' },
]

export function PeriodFilter({ current }: { current: TAnalyticsPeriod }) {
  const { setPeriod } = usePeriodFilter(current)

  return (
    <div className="flex gap-1 rounded-lg border border-neutral-800 bg-neutral-900 p-1">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setPeriod(value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            current === value
              ? 'bg-neutral-700 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
