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

  const lookup = new Map<string, number>()
  let maxSaves = 1
  for (const w of data) {
    const key = `${w.dayOfWeek}-${w.hour}`
    lookup.set(key, w.savesAvg)
    if (w.savesAvg > maxSaves) maxSaves = w.savesAvg
  }

  return (
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
                const val      = lookup.get(`${dayIdx}-${hour}`) ?? 0
                const alpha    = val / maxSaves
                const savesAvg = lookup.get(`${dayIdx}-${hour}`) ?? 0
                return (
                  <div
                    key={hour}
                    title={`${day} ${hour}h — ${savesAvg.toFixed(1)} saves moy.`}
                    className="h-4 flex-1 rounded-sm"
                    style={{
                      backgroundColor:
                        alpha === 0
                          ? 'rgba(38,38,38,0.5)'
                          : `rgba(99,102,241,${0.15 + alpha * 0.75})`,
                    }}
                  />
                )
              })}
            </div>
          </div>
        ))}

        <p className="mt-2 text-xs text-neutral-600">
          Intensité = saves moyens par créneau heure × jour sur la période sélectionnée
        </p>
      </div>
    </div>
  )
}
