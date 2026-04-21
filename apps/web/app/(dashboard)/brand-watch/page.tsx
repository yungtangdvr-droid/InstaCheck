import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  buildReviewQueue,
  listBrandOptions,
  listWatchlistRows,
} from '@/features/brand-watch/queries'
import {
  REVIEW_WINDOW_OPTIONS,
  parseWindow,
} from '@/features/brand-watch/utils'
import { NewWatchlistInline } from '@/components/brand-watch/NewWatchlistInline'
import { ReviewQueue } from '@/components/brand-watch/ReviewQueue'
import { WatchlistRow } from '@/components/brand-watch/WatchlistRow'

export default async function BrandWatchPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>
}) {
  const { window: windowParam } = await searchParams
  const windowDays = parseWindow(windowParam)

  const supabase = await createServerSupabaseClient()

  const [{ rows, summary }, watchRows, brands] = await Promise.all([
    buildReviewQueue(supabase, windowDays),
    listWatchlistRows(supabase, windowDays),
    listBrandOptions(supabase),
  ])

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Brand Watch</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Veille changedetection.io · {summary.totalEvents} événement
            {summary.totalEvents === 1 ? '' : 's'} sur {windowDays}j ·{' '}
            {summary.matchedEvents} matched · {summary.ambiguousEvents} ambigus ·{' '}
            {summary.unmatchedEvents} non matchés
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {REVIEW_WINDOW_OPTIONS.map((w) => (
            <Link
              key={w}
              href={`/brand-watch?window=${w}`}
              className={`rounded px-3 py-1.5 font-medium transition-colors ${
                w === windowDays
                  ? 'bg-white text-black'
                  : 'border border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white'
              }`}
            >
              {w}j
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Stat label="Watchlists actives" value={summary.activeWatches} />
        <Stat label="Matched" value={summary.matchedEvents} />
        <Stat label="Ambigus"  value={summary.ambiguousEvents} highlight={summary.ambiguousEvents > 0} />
        <Stat label="Non matchés" value={summary.unmatchedEvents} />
      </div>

      <ReviewQueue rows={rows} brands={brands} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Watchlists
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Liste complète des URLs surveillées, toutes brands confondues.
            </p>
          </div>
          <NewWatchlistInline brands={brands} />
        </div>
        {watchRows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-800 px-3 py-4 text-sm text-neutral-500">
            Aucune URL surveillée. Ajoute une première watchlist pour démarrer la veille.
          </p>
        ) : (
          <ul className="space-y-2">
            {watchRows.map((row) => (
              <WatchlistRow key={row.id} row={row} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        highlight
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-neutral-800 bg-neutral-900'
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white tabular-nums">{value}</p>
    </div>
  )
}
