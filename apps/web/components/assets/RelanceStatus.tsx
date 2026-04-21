import type { TRelanceStatus } from '@creator-hub/types'
import { formatDateTime } from '@/features/assets/utils'

export function RelanceStatus({ status }: { status: TRelanceStatus }) {
  const { openedCount, completedCount, lastEventAt, relanceTaskId, relanceDueAt, relanceDone } = status

  const badge = resolveBadge(status)

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">Relance</p>
          <p className={`mt-1 text-sm font-medium ${badge.tone}`}>{badge.label}</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-neutral-400">
          <Stat label="Ouvertures" value={openedCount} />
          <Stat label="Terminés" value={completedCount} />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-neutral-400 sm:grid-cols-2">
        <div>
          <dt className="text-neutral-500">Dernière activité</dt>
          <dd className="text-neutral-200">{formatDateTime(lastEventAt)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Tâche de relance</dt>
          <dd className="text-neutral-200">
            {relanceTaskId
              ? `${relanceDone ? 'Faite' : 'Prévue'} · ${formatDateTime(relanceDueAt)}`
              : 'Aucune'}
          </dd>
        </div>
      </dl>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-sm font-medium text-white">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
    </div>
  )
}

function resolveBadge(status: TRelanceStatus): { label: string; tone: string } {
  if (status.openedCount === 0) {
    return { label: 'En attente de première ouverture', tone: 'text-neutral-400' }
  }
  if (status.relanceTaskId && !status.relanceDone) {
    return { label: 'Relance programmée', tone: 'text-amber-300' }
  }
  if (status.relanceDone) {
    return { label: 'Relance effectuée', tone: 'text-emerald-300' }
  }
  return { label: 'Ouvert — pas de relance planifiée', tone: 'text-sky-300' }
}
