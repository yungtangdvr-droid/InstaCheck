import Link from 'next/link'
import type { BrandListRow } from '@creator-hub/types'
import { BRAND_STATUS_BADGE, BRAND_STATUS_LABEL, formatDate } from '@/features/crm/utils'
import { FitScoreBadge } from './FitScoreBadge'

export function BrandCard({ brand }: { brand: BrandListRow }) {
  return (
    <Link
      href={`/crm/brands/${brand.id}`}
      className="block rounded-lg border border-neutral-800 bg-neutral-900 p-4 transition-colors hover:border-neutral-700"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">{brand.name}</h3>
          <p className="mt-0.5 truncate text-xs text-neutral-500">
            {brand.category ?? '—'}
            {brand.country ? ` · ${brand.country}` : ''}
          </p>
        </div>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${BRAND_STATUS_BADGE[brand.status]}`}
        >
          {BRAND_STATUS_LABEL[brand.status]}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <FitScoreBadge
          aesthetic={brand.aestheticFitScore}
          business={brand.businessFitScore}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
        <span>
          {brand.contactsCount} contact{brand.contactsCount === 1 ? '' : 's'} ·{' '}
          {brand.openTasksCount} open task{brand.openTasksCount === 1 ? '' : 's'}
        </span>
        <span>
          Last touch{' '}
          <span className="text-neutral-400">{formatDate(brand.lastTouchpointAt)}</span>
        </span>
      </div>
    </Link>
  )
}
