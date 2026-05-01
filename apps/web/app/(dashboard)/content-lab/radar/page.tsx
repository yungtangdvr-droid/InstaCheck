import { Radar } from 'lucide-react'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'

import {
  DEFAULT_RADAR_WINDOW,
  RADAR_DISPLAY_CAP,
  getRadarFeed,
  isRadarWindow,
  radarWindowSince,
  type TRadarWindow,
} from '@/features/content-lab/radar/get-radar-feed'
import { RadarKpiStrip } from '@/features/content-lab/radar/RadarKpiStrip'
import { RadarFilters } from '@/features/content-lab/radar/RadarFilters'
import { RadarItemCard } from '@/features/content-lab/radar/RadarItemCard'

type SearchParams = Promise<{ window?: string; source?: string }>

export default async function RadarPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp     = await searchParams
  const window: TRadarWindow = isRadarWindow(sp.window) ? sp.window : DEFAULT_RADAR_WINDOW
  const sourceParam = sp.source && sp.source.length > 0 ? sp.source : 'all'
  const sourceId    = sourceParam === 'all' ? undefined : sourceParam

  const supabase = await createServerSupabaseClient()
  const feed = await getRadarFeed(supabase, {
    sinceIso: radarWindowSince(window),
    sourceId,
  })

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Content Lab"
        title="Meme Radar"
        description="Flux d'actualités scoré par potentiel mémable et fit Yugnat. Aucun item n'est masqué automatiquement."
      />

      <RadarKpiStrip kpis={feed.kpis} window={window} />

      <RadarFilters window={window} sourceId={sourceParam} sources={feed.sources} />

      {feed.items.length === 0 ? (
        <EmptyState
          icon={<Radar className="size-5" />}
          title="Aucun item dans cette fenêtre"
          description="Ajuste la fenêtre temporelle ou attends le prochain ingest RSS."
        />
      ) : (
        <div className="space-y-3">
          {feed.items.map((item) => (
            <RadarItemCard key={item.id} item={item} />
          ))}
          {feed.kpis.totalInWindow > RADAR_DISPLAY_CAP ? (
            <p className="px-1 text-xs text-muted-foreground">
              Affichage limité aux {RADAR_DISPLAY_CAP} meilleurs items sur {feed.kpis.totalInWindow} dans la fenêtre.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
