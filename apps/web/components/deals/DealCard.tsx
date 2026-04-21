import Link from 'next/link'
import type { OpportunityListRow } from '@creator-hub/types'
import { StageDropdown } from './StageDropdown'
import { daysSince, formatMoney } from '@/features/deals/utils'

export function DealCard({ deal }: { deal: OpportunityListRow }) {
  const days = daysSince(deal.lastActivityAt)

  return (
    <article className="group rounded-lg border border-neutral-800 bg-neutral-900 p-3 transition-colors hover:border-neutral-700">
      <Link href={`/deals/${deal.id}`} className="block space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-medium text-neutral-100 group-hover:text-white">
            {deal.name}
          </h3>
          {deal.hasDeck && (
            <span
              className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
              aria-label="Deck linked"
              title="Deck lié"
            />
          )}
        </div>

        {deal.brandName && (
          <p className="truncate text-xs text-neutral-400">{deal.brandName}</p>
        )}

        <div className="flex items-center justify-between gap-2 text-xs text-neutral-500">
          <span>{formatMoney(deal.estimatedValue, deal.currency)}</span>
          <span>{deal.probability}%</span>
        </div>

        {deal.nextAction && (
          <p className="truncate text-xs text-neutral-400">→ {deal.nextAction}</p>
        )}

        <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
          <span>
            {days === null ? 'sans activité' : days === 0 ? 'aujourd’hui' : `il y a ${days}j`}
          </span>
          {deal.openTasksCount > 0 && (
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">
              {deal.openTasksCount} tâche{deal.openTasksCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </Link>

      <div className="mt-2 border-t border-neutral-800 pt-2">
        <StageDropdown opportunityId={deal.id} stage={deal.stage} />
      </div>
    </article>
  )
}
