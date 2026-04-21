import type { OpportunityStageEvent } from '@creator-hub/types'
import { DEAL_STAGE_BADGE, DEAL_STAGE_LABEL, formatDateTime } from '@/features/deals/utils'

export function DealTimeline({ events }: { events: OpportunityStageEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-neutral-500">Aucun changement de stage enregistré.</p>
  }

  return (
    <ol className="flex flex-col gap-2">
      {events.map((ev) => (
        <li
          key={ev.id}
          className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2"
        >
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${DEAL_STAGE_BADGE[ev.stage]}`}
          >
            {DEAL_STAGE_LABEL[ev.stage]}
          </span>
          <span className="text-xs text-neutral-500">{formatDateTime(ev.changedAt)}</span>
        </li>
      ))}
    </ol>
  )
}
