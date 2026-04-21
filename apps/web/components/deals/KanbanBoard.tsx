import type { DealStage, OpportunityListRow } from '@creator-hub/types'
import { DEAL_STAGES, DEAL_STAGE_BADGE, DEAL_STAGE_LABEL } from '@/features/deals/utils'
import { DealCard } from './DealCard'

type Props = {
  groups: Record<DealStage, OpportunityListRow[]>
}

export function KanbanBoard({ groups }: Props) {
  return (
    <div className="-mx-8 overflow-x-auto px-8 pb-4">
      <div className="flex min-w-max gap-3">
        {DEAL_STAGES.map((stage) => {
          const deals = groups[stage] ?? []
          return (
            <section
              key={stage}
              className="flex w-64 shrink-0 flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-2"
            >
              <header className="flex items-center justify-between px-1 pb-1">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${DEAL_STAGE_BADGE[stage]}`}
                >
                  {DEAL_STAGE_LABEL[stage]}
                </span>
                <span className="text-xs text-neutral-500">{deals.length}</span>
              </header>

              <div className="flex flex-col gap-2">
                {deals.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-neutral-600">—</p>
                ) : (
                  deals.map((deal) => <DealCard key={deal.id} deal={deal} />)
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
