import Link from 'next/link'
import type { ReviewQueueRow } from '@creator-hub/types'
import { formatDateTime, formatRelative, urlHost } from '@/features/brand-watch/utils'
import { EventToTaskButton } from './EventToTaskButton'
import { NewWatchlistInline } from './NewWatchlistInline'

type BrandOption = { id: string; name: string }

type Props = {
  rows:   ReviewQueueRow[]
  brands: BrandOption[]
}

export function ReviewQueue({ rows, brands }: Props) {
  const matched    = rows.filter((r) => r.status === 'matched')
  const ambiguous  = rows.filter((r) => r.status === 'ambiguous')
  const unmatched  = rows.filter((r) => r.status === 'unmatched')

  return (
    <div className="space-y-10">
      <Section title={`Matched (${matched.length})`} subtitle="Événements liés à une seule watchlist active.">
        {matched.length === 0 ? (
          <Empty>Aucun événement matché sur cette fenêtre.</Empty>
        ) : (
          <ul className="space-y-2">
            {matched.map((r) => {
              const c = r.candidates[0]
              return (
                <li
                  key={r.event.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                >
                  <EventMeta row={r} />
                  <Link
                    href={`/crm/brands/${c.brandId}`}
                    className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200 hover:text-white"
                  >
                    {c.brandName}
                  </Link>
                  <EventToTaskButton
                    brandId={c.brandId}
                    watchlistId={c.watchlistId}
                    eventUrl={r.event.url}
                    label={c.label}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section
        title={`Ambiguous (${ambiguous.length})`}
        subtitle="Plusieurs watchlists actives correspondent à cette URL. Désactive ou supprime les doublons pour rendre la résolution déterministe avant de créer une tâche."
      >
        {ambiguous.length === 0 ? (
          <Empty>Aucune ambiguïté.</Empty>
        ) : (
          <ul className="space-y-2">
            {ambiguous.map((r) => (
              <li
                key={r.event.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2"
              >
                <EventMeta row={r} />
                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
                  Ambigu · {r.candidates.length} watchlists
                </span>
                <div className="flex flex-wrap gap-1">
                  {r.candidates.map((c) => (
                    <Link
                      key={c.watchlistId}
                      href={`/crm/brands/${c.brandId}`}
                      className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200 hover:text-white"
                    >
                      {c.brandName}
                    </Link>
                  ))}
                </div>
                <span className="text-xs text-neutral-500">Pas de tâche auto.</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={`Unmatched (${unmatched.length})`}
        subtitle="URLs détectées mais sans watchlist active. Ajoute-les à une brand pour les faire entrer dans le pipeline."
      >
        {unmatched.length === 0 ? (
          <Empty>Aucune URL hors périmètre.</Empty>
        ) : (
          <ul className="space-y-2">
            {unmatched.map((r) => (
              <li
                key={r.event.id}
                className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <EventMeta row={r} />
                </div>
                <NewWatchlistInline
                  brands={brands}
                  presetUrl={r.event.url}
                  buttonLabel="+ Ajouter à une brand"
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title:    string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
        <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-neutral-800 px-3 py-4 text-sm text-neutral-500">
      {children}
    </p>
  )
}

function EventMeta({ row }: { row: ReviewQueueRow }) {
  return (
    <div className="min-w-0 flex-1">
      <a
        href={row.event.url}
        target="_blank"
        rel="noreferrer"
        className="block truncate text-sm text-neutral-200 hover:text-white"
      >
        {urlHost(row.event.url)}
      </a>
      <p className="truncate text-xs text-neutral-500">{row.event.url}</p>
      {row.event.changeSummary && (
        <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{row.event.changeSummary}</p>
      )}
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-600">
        {formatRelative(row.event.detectedAt)} · {formatDateTime(row.event.detectedAt)}
      </p>
    </div>
  )
}
