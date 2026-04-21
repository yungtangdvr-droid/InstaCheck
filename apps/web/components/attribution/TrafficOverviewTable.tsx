import type { TTrafficOverviewRow } from '@creator-hub/types'

export function TrafficOverviewTable({
  title,
  rows,
  keyLabel,
}: {
  title:    string
  rows:     TTrafficOverviewRow[]
  keyLabel: string
}) {
  if (rows.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-300">{title}</h2>
        <p className="rounded-lg border border-dashed border-neutral-800 px-4 py-6 text-center text-xs text-neutral-500">
          Aucun clic sur la période.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-neutral-300">{title}</h2>
      <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">{keyLabel}</th>
              <th className="px-4 py-2 text-right font-medium">Clics</th>
              <th className="px-4 py-2 text-right font-medium">Attribués</th>
              <th className="px-4 py-2 text-right font-medium">% attribué</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {rows.map((row) => {
              const pct = row.clicks > 0
                ? Math.round((row.attributedClicks / row.clicks) * 100)
                : 0
              return (
                <tr key={`${row.kind}:${row.key}`}>
                  <td className="max-w-[22rem] truncate px-4 py-2 text-white" title={row.key}>
                    {row.key}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-white">{row.clicks}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-300">
                    {row.attributedClicks}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-500">{pct}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
