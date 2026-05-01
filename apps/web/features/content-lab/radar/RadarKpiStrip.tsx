import { KpiTile } from '@/components/ui/kpi-tile'
import { humanizeFormat, type RadarFeedKpis } from './get-radar-feed'

type RadarKpiStripProps = {
  kpis:   RadarFeedKpis
  window: string
}

export function RadarKpiStrip({ kpis, window }: RadarKpiStripProps) {
  const composite = kpis.avgComposite == null ? '—' : Math.round(kpis.avgComposite).toString()
  const topFormat = humanizeFormat(kpis.topRecommendedFormat) ?? '—'

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiTile
        label="Items in window"
        value={kpis.totalInWindow}
        hint={`Window: ${window}`}
      />
      <KpiTile
        label="Scored"
        value={kpis.scoredInWindow}
        hint={kpis.totalInWindow > 0
          ? `${Math.round((kpis.scoredInWindow / kpis.totalInWindow) * 100)}% of window`
          : 'No items yet'}
      />
      <KpiTile
        label="Avg composite"
        value={composite}
        unit={kpis.avgComposite == null ? undefined : '/100'}
      />
      <KpiTile
        label="Top recommended format"
        value={topFormat}
      />
    </div>
  )
}
