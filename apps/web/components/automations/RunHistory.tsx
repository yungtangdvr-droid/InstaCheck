import type { AutomationRun } from '@creator-hub/types'
import { formatRelative } from '@/features/automations/utils'

type Props = {
  runs: AutomationRun[]
  expandedCount?: number
}

const STATUS_CLASSES: Record<string, string> = {
  success: 'text-emerald-300',
  failed:  'text-red-300',
  skipped: 'text-amber-300',
}

export function RunHistory({ runs, expandedCount = 5 }: Props) {
  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-8 text-center text-sm text-neutral-500">
        No runs recorded yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-neutral-950 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Summary</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-900">
          {runs.map((run, idx) => {
            const cls = STATUS_CLASSES[run.status] ?? 'text-neutral-300'
            const showFull = idx < expandedCount
            const text = run.resultSummary ?? ''
            const display = showFull ? text : text.length > 120 ? `${text.slice(0, 120)}…` : text

            return (
              <tr key={run.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 text-neutral-400">
                  <div>{formatRelative(run.ranAt)}</div>
                  <div className="text-[11px] text-neutral-600">{new Date(run.ranAt).toISOString()}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className={`text-xs font-medium uppercase tracking-wide ${cls}`}>
                    {run.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-neutral-300">
                  {display
                    ? <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">{display}</pre>
                    : <span className="text-neutral-600">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
