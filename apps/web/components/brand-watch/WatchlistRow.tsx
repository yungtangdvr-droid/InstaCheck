'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { WatchlistListRow } from '@creator-hub/types'
import { deleteWatchlist, toggleWatchlist } from '@/features/brand-watch/actions'
import { formatRelative, urlHost } from '@/features/brand-watch/utils'

type Props = {
  row:         WatchlistListRow
  showBrand?:  boolean
}

export function WatchlistRow({ row, showBrand = true }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function toggle() {
    startTransition(async () => {
      await toggleWatchlist(row.id, !row.active)
      router.refresh()
    })
  }

  function remove() {
    startTransition(async () => {
      await deleteWatchlist(row.id)
      router.refresh()
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
      <div className="min-w-0 flex-1">
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-sm text-neutral-200 hover:text-white"
        >
          {row.label ?? urlHost(row.url)}
        </a>
        <p className="truncate text-xs text-neutral-500">{row.url}</p>
      </div>
      {showBrand && (
        <Link
          href={`/crm/brands/${row.brandId}`}
          className="text-xs text-neutral-400 underline-offset-2 hover:underline"
        >
          {row.brandName}
        </Link>
      )}
      <div className="text-xs text-neutral-500 tabular-nums">
        {row.eventsCount} event{row.eventsCount === 1 ? '' : 's'}
      </div>
      <div className="text-xs text-neutral-500">
        {row.lastEventAt ? formatRelative(row.lastEventAt) : '—'}
      </div>
      <button
        onClick={toggle}
        disabled={isPending}
        className={`rounded px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
          row.active
            ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
            : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
        }`}
      >
        {row.active ? 'Actif' : 'Pausé'}
      </button>
      <button
        onClick={remove}
        disabled={isPending}
        className="rounded px-2 py-1 text-xs text-neutral-500 transition-colors hover:text-red-400 disabled:opacity-50"
        aria-label="Supprimer"
      >
        ×
      </button>
    </li>
  )
}
