'use client'
import type { TPostingWindow } from '@creator-hub/types'

type Props = { data: TPostingWindow[] }

const DAYS  = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

export function BestWindowHeatmap({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
        Pas encore de données de créneaux de publication
      </div>
    )
  }

  const lookup = new Map<string, TPostingWindow>()
  let maxSaves = 1
  for (const w of data) {
    const key = `${w.dayOfWeek}-${w.hour}`
    lookup.set(key, w)
    if (w.savesAvg > maxSaves) maxSaves = w.savesAvg
  }

  // Top slots: exclude low-sample cells, rank by savesAvg, take 5.
  const topSlots = [...data]
    .filter(w => !w.lowSample && w.savesAvg > 0)
    .sort((a, b) => b.savesAvg - a.savesAvg)
    .slice(0, 5)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(200px,260px)]">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 560 }}>
          {/* Hour labels */}
          <div className="mb-1 flex items-center">
            <span className="w-10 flex-shrink-0" />
            <div className="flex flex-1 gap-px">
              {HOURS.map(h => (
                <div key={h} className="flex-1 text-center text-[9px] text-neutral-600">
                  {h % 6 === 0 ? `${h}h` : ''}
                </div>
              ))}
            </div>
          </div>

          {/* Grid rows */}
          {DAYS.map((day, dayIdx) => (
            <div key={day} className="mb-0.5 flex items-center gap-1">
              <span className="w-9 flex-shrink-0 text-right text-[10px] text-neutral-500">{day}</span>
              <div className="flex flex-1 gap-px">
                {HOURS.map(hour => {
                  const cell       = lookup.get(`${dayIdx}-${hour}`)
                  const savesAvg   = cell?.savesAvg ?? 0
                  const count      = cell?.count    ?? 0
                  const lowSample  = cell?.lowSample ?? false
                  const alpha      = savesAvg / maxSaves
                  const background =
                    alpha === 0
                      ? 'rgba(38,38,38,0.5)'
                      : `rgba(99,102,241,${0.15 + alpha * 0.75})`
                  return (
                    <div
                      key={hour}
                      title={
                        cell
                          ? `${day} ${hour}h — ${savesAvg.toFixed(1)} saves moy. · ${count} post${count > 1 ? 's' : ''}${lowSample ? ' · échantillon faible' : ''}`
                          : `${day} ${hour}h — aucun post`
                      }
                      className="h-4 flex-1 rounded-sm"
                      style={{
                        backgroundColor: background,
                        opacity: lowSample ? 0.5 : 1,
                        outline: lowSample ? '1px dashed rgba(115,115,115,0.4)' : 'none',
                        outlineOffset: '-1px',
                      }}
                    />
                  )
                })}
              </div>
            </div>
          ))}

          <p className="mt-2 text-xs text-neutral-600">
            Intensité = saves moyens par créneau heure × jour sur la période sélectionnée.
            Les cellules pointillées ont moins de 2 posts et sont peu fiables.
          </p>
        </div>
      </div>

      <aside className="rounded-md border border-neutral-800 bg-neutral-950/40 p-3">
        <h3 className="mb-2 text-xs font-medium text-neutral-300">Top créneaux</h3>
        {topSlots.length === 0 ? (
          <p className="text-xs text-neutral-500">
            Pas encore assez d&apos;échantillon pour recommander un créneau.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {topSlots.map((w, i) => (
              <li
                key={`${w.dayOfWeek}-${w.hour}`}
                className="flex items-center justify-between gap-2 text-xs text-neutral-300"
              >
                <span className="flex items-center gap-2">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-neutral-800 text-[10px] text-neutral-500 tabular-nums">
                    {i + 1}
                  </span>
                  <span>
                    {DAYS[w.dayOfWeek]} {String(w.hour).padStart(2, '0')}h
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  <span className="text-neutral-200">{w.savesAvg.toFixed(1)}</span>
                  <span className="text-neutral-600"> / {w.count}p</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-[11px] text-neutral-600">
          Saves moyens / nombre de posts dans le créneau. Cellules à &lt; 2 posts exclues.
        </p>
      </aside>
    </div>
  )
}
