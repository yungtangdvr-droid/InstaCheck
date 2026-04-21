'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { BrandStatus } from '@creator-hub/types'
import { BRAND_STATUSES, BRAND_STATUS_LABEL } from '@/features/crm/utils'

type Tab = { value: BrandStatus | 'all'; label: string }

const TABS: Tab[] = [
  { value: 'all', label: 'All' },
  ...BRAND_STATUSES.map((s) => ({ value: s, label: BRAND_STATUS_LABEL[s] })),
]

export function BrandStatusTabs({ current }: { current: BrandStatus | 'all' }) {
  const params = useSearchParams()

  function hrefFor(value: Tab['value']) {
    const next = new URLSearchParams(params.toString())
    if (value === 'all') next.delete('status')
    else next.set('status', value)
    const qs = next.toString()
    return qs ? `/crm?${qs}` : '/crm'
  }

  return (
    <div className="flex gap-1 rounded-lg border border-neutral-800 bg-neutral-900 p-1">
      {TABS.map(({ value, label }) => (
        <Link
          key={value}
          href={hrefFor(value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            current === value
              ? 'bg-neutral-700 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  )
}
