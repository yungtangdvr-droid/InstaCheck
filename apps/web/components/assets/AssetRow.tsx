import Link from 'next/link'
import type { AssetListRow } from '@creator-hub/types'
import { ASSET_TYPE_LABEL, formatDateTime } from '@/features/assets/utils'

export function AssetRow({ asset }: { asset: AssetListRow }) {
  return (
    <Link
      href={`/assets/${asset.id}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm transition-colors hover:border-neutral-700"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-white">{asset.name}</span>
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
            {ASSET_TYPE_LABEL[asset.type]}
          </span>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Dernière activité · {formatDateTime(asset.lastEventAt)}
        </p>
      </div>
      <div className="flex items-center gap-4 text-xs text-neutral-400">
        <Stat label="Ouvertures" value={asset.openedCount} />
        <Stat label="Événements" value={asset.eventsCount} />
        <Stat label="Deals liés" value={asset.linkedOpportunitiesCount} />
      </div>
    </Link>
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
