import type { AssetEvent } from '@creator-hub/types'
import {
  ASSET_EVENT_BADGE,
  ASSET_EVENT_TYPE_LABEL,
  formatDateTime,
  formatDuration,
} from '@/features/assets/utils'

export function OpenEventFeed({ events }: { events: AssetEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-800 px-4 py-6 text-center text-sm text-neutral-500">
        Aucun événement pour l&apos;instant. Les ouvertures Papermark apparaîtront ici.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900">
      {events.map((ev) => (
        <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
          <div className="flex items-center gap-3">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${ASSET_EVENT_BADGE[ev.eventType]}`}>
              {ASSET_EVENT_TYPE_LABEL[ev.eventType]}
            </span>
            <span className="text-neutral-300">{formatDateTime(ev.occurredAt)}</span>
            {ev.viewerFingerprint && (
              <span className="font-mono text-xs text-neutral-500">
                {ev.viewerFingerprint.slice(0, 12)}
              </span>
            )}
          </div>
          <span className="text-xs text-neutral-500">{formatDuration(ev.durationMs)}</span>
        </li>
      ))}
    </ul>
  )
}
