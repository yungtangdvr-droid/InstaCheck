import type { Touchpoint } from '@creator-hub/types'
import { TOUCHPOINT_LABEL, formatDateTime } from '@/features/crm/utils'

const TYPE_BADGE: Record<string, string> = {
  email:   'bg-sky-500/15 text-sky-400',
  dm:      'bg-fuchsia-500/15 text-fuchsia-400',
  call:    'bg-emerald-500/15 text-emerald-400',
  meeting: 'bg-amber-500/15 text-amber-400',
  other:   'bg-neutral-800 text-neutral-400',
}

export function ContactTimeline({ touchpoints }: { touchpoints: Touchpoint[] }) {
  if (touchpoints.length === 0) {
    return (
      <p className="text-sm text-neutral-500">Aucun touchpoint enregistré.</p>
    )
  }

  return (
    <ol className="flex flex-col gap-2">
      {touchpoints.map((tp) => (
        <li
          key={tp.id}
          className="flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
        >
          <span
            className={`mt-0.5 rounded px-2 py-0.5 text-xs font-medium ${
              TYPE_BADGE[tp.type] ?? TYPE_BADGE.other
            }`}
          >
            {TOUCHPOINT_LABEL[tp.type] ?? tp.type}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-neutral-200">
              {tp.note ?? <span className="italic text-neutral-500">Sans note</span>}
            </p>
            <p className="mt-1 text-xs text-neutral-500">{formatDateTime(tp.occurredAt)}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
