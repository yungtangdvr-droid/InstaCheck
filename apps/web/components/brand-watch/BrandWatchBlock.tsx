import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  listRecentEventsForBrand,
  listWatchlistRows,
} from '@/features/brand-watch/queries'
import { formatDateTime, formatRelative, urlHost } from '@/features/brand-watch/utils'
import { NewWatchlistInline } from './NewWatchlistInline'
import { WatchlistRow } from './WatchlistRow'

type Props = {
  brandId:     string
  windowDays?: number
}

export async function BrandWatchBlock({ brandId, windowDays = 14 }: Props) {
  const supabase = await createServerSupabaseClient()

  const [rows, events] = await Promise.all([
    listWatchlistRows(supabase, windowDays),
    listRecentEventsForBrand(supabase, brandId, windowDays, 5),
  ])

  const forBrand = rows.filter((r) => r.brandId === brandId)

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-300">Veille marques</h2>
        <NewWatchlistInline
          brands={[{ id: brandId, name: 'cette brand' }]}
          presetBrandId={brandId}
          buttonLabel="+ Surveiller une URL"
        />
      </div>

      {forBrand.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune URL surveillée pour cette brand.</p>
      ) : (
        <ul className="space-y-2">
          {forBrand.map((row) => (
            <WatchlistRow key={row.id} row={row} showBrand={false} />
          ))}
        </ul>
      )}

      <div>
        <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Derniers signaux ({windowDays}j)
        </h3>
        {events.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">Aucun changement détecté.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5"
              >
                <a
                  href={ev.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm text-neutral-200 hover:text-white"
                >
                  {urlHost(ev.url)}
                </a>
                <span className="text-xs text-neutral-500">{formatRelative(ev.detectedAt)}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-neutral-600">
                  {formatDateTime(ev.detectedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
