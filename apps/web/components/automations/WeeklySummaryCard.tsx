import type { WeeklySummary } from '@creator-hub/types'

type Props = {
  summaries: WeeklySummary[]
}

function fmtDelta(n: number): string {
  if (n === 0) return '0'
  return n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString()
}

function deltaTone(n: number): string {
  if (n === 0) return 'text-neutral-400'
  return n > 0 ? 'text-emerald-300' : 'text-red-300'
}

export function WeeklySummaryCard({ summaries }: Props) {
  if (summaries.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-6 text-sm text-neutral-500">
        No weekly summaries yet. Scheduled every Monday at 08:00 UTC.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-neutral-950 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-3 py-2 font-medium">Week of</th>
            <th className="px-3 py-2 font-medium">Reach Δ</th>
            <th className="px-3 py-2 font-medium">Saves Δ</th>
            <th className="px-3 py-2 font-medium">New leads</th>
            <th className="px-3 py-2 font-medium">Deals moved</th>
            <th className="px-3 py-2 font-medium">Deck opens</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-900 tabular-nums">
          {summaries.map((s) => (
            <tr key={s.id}>
              <td className="whitespace-nowrap px-3 py-2 text-neutral-300">{s.weekStart}</td>
              <td className={`whitespace-nowrap px-3 py-2 ${deltaTone(s.reachDelta)}`}>{fmtDelta(s.reachDelta)}</td>
              <td className={`whitespace-nowrap px-3 py-2 ${deltaTone(s.savesDelta)}`}>{fmtDelta(s.savesDelta)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-neutral-300">{s.newLeads}</td>
              <td className="whitespace-nowrap px-3 py-2 text-neutral-300">{s.dealsMoved}</td>
              <td className="whitespace-nowrap px-3 py-2 text-neutral-300">{s.deckOpens}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
