import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getAttributionStatsFor,
  listAttributionFor,
} from '@/features/attribution/queries'
import { formatDateTime } from '@/features/attribution/utils'

const PERIOD_DAYS = 30

export async function OpportunityTrafficBlock({ opportunityId }: { opportunityId: string }) {
  const supabase = await createServerSupabaseClient()
  const [stats, events] = await Promise.all([
    getAttributionStatsFor(supabase, { opportunityId }, PERIOD_DAYS),
    listAttributionFor(supabase, { opportunityId }, PERIOD_DAYS, 10),
  ])

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-neutral-300">Trafic attribué (30j)</h2>
        <span className="text-xs text-neutral-500">Dernier clic · {formatDateTime(stats.lastClickAt)}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Clics" value={stats.totalClicks} />
        <Stat label="Referrers" value={stats.uniqueReferrers} />
        <Stat
          label="Top referrer"
          value={stats.topReferrer ? `${stats.topReferrer.key} (${stats.topReferrer.clicks})` : '—'}
        />
      </div>
      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-800 px-4 py-4 text-center text-xs text-neutral-500">
          Aucun clic attribué à cette opportunité. Crée une règle dans{' '}
          <a href="/attribution/rules" className="underline">/attribution/rules</a>.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900">
          {events.map((ev) => (
            <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs">
              <span className="truncate text-neutral-300" title={ev.url}>{ev.url}</span>
              <span className="text-neutral-500">{ev.referrer ?? '(direct)'}</span>
              <span className="text-neutral-600">{formatDateTime(ev.occurredAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-white" title={String(value)}>{value}</p>
    </div>
  )
}
