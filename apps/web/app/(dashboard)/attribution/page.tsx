import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getTrafficOverview } from '@/features/attribution/queries'
import { TrafficOverviewTable } from '@/components/attribution/TrafficOverviewTable'

const PERIOD_OPTIONS = [7, 30, 90] as const
type Period = (typeof PERIOD_OPTIONS)[number]

function parsePeriod(value: string | undefined): Period {
  const n = Number(value)
  return (PERIOD_OPTIONS as readonly number[]).includes(n) ? (n as Period) : 30
}

export default async function AttributionOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period = parsePeriod(periodParam)

  const supabase = await createServerSupabaseClient()
  const overview = await getTrafficOverview(supabase, period)

  const attributedPct = overview.totalClicks > 0
    ? Math.round((overview.attributedClicks / overview.totalClicks) * 100)
    : 0

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Attribution</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {overview.totalClicks} clics sur {period}j · {overview.attributedClicks} attribués ({attributedPct}%)
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {PERIOD_OPTIONS.map((p) => (
            <Link
              key={p}
              href={`/attribution?period=${p}`}
              className={`rounded px-3 py-1.5 font-medium transition-colors ${
                p === period
                  ? 'bg-white text-black'
                  : 'border border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white'
              }`}
            >
              {p}j
            </Link>
          ))}
          <Link
            href="/attribution/rules"
            className="ml-2 rounded border border-neutral-800 px-3 py-1.5 font-medium text-neutral-300 transition-colors hover:border-neutral-700 hover:text-white"
          >
            Règles
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total clics" value={overview.totalClicks} />
        <Stat label="Attribués" value={overview.attributedClicks} />
        <Stat label="Non attribués" value={overview.unattributedClicks} />
      </div>

      <TrafficOverviewTable title="Top referrers" rows={overview.byReferrer} keyLabel="Referrer" />
      <TrafficOverviewTable title="Top URLs" rows={overview.byUrl} keyLabel="URL" />
      <TrafficOverviewTable title="Top utm_source" rows={overview.byUtmSource} keyLabel="utm_source" />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white tabular-nums">{value}</p>
    </div>
  )
}
