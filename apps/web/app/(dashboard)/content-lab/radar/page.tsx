import { Radar } from 'lucide-react'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'

import {
  DEFAULT_RADAR_VIEW,
  DEFAULT_RADAR_WINDOW,
  RADAR_DISPLAY_CAP,
  RADAR_SAVED_LOOKBACK_DAYS,
  getRadarFeed,
  isRadarView,
  isRadarWindow,
  radarWindowSince,
  type TRadarView,
  type TRadarWindow,
} from '@/features/content-lab/radar/get-radar-feed'
import { RadarKpiStrip } from '@/features/content-lab/radar/RadarKpiStrip'
import { RadarFilters } from '@/features/content-lab/radar/RadarFilters'
import { RadarItemCard } from '@/features/content-lab/radar/RadarItemCard'
import { RadarViewTabs } from '@/features/content-lab/radar/RadarViewTabs'
import { RefreshRadarButton } from '@/features/content-lab/radar/RefreshRadarButton'

type SearchParams = Promise<{ window?: string; source?: string; view?: string }>

const EMPTY_STATE_BY_VIEW: Record<TRadarView, { title: string; description: string }> = {
  all: {
    title:       'Aucun item dans cette fenêtre',
    description: 'Ajuste la fenêtre temporelle ou attends le prochain ingest RSS.',
  },
  saved: {
    title:       `Aucune idée sauvegardée sur ${RADAR_SAVED_LOOKBACK_DAYS} j`,
    description: 'Sauvegarde des items depuis la vue Tous pour construire ton shortlist.',
  },
  new: {
    title:       'Aucun item « New » dans cette fenêtre',
    description: 'Tous les items de la fenêtre ont déjà été décidés.',
  },
  ignored: {
    title:       'Aucun item ignoré dans cette fenêtre',
    description: 'Les ignores apparaîtront ici une fois marqués.',
  },
}

export default async function RadarPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp     = await searchParams
  const window: TRadarWindow = isRadarWindow(sp.window) ? sp.window : DEFAULT_RADAR_WINDOW
  const view:   TRadarView   = isRadarView(sp.view)     ? sp.view   : DEFAULT_RADAR_VIEW
  const sourceParam = sp.source && sp.source.length > 0 ? sp.source : 'all'
  const sourceId    = sourceParam === 'all' ? undefined : sourceParam

  const supabase = await createServerSupabaseClient()
  const feed = await getRadarFeed(supabase, {
    sinceIso: radarWindowSince(window),
    sourceId,
    view,
  })

  const empty = EMPTY_STATE_BY_VIEW[view]
  const isSavedView = view === 'saved'

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Content Lab"
        title="Meme Radar"
        description="Flux d'actualités scoré par potentiel mémable et fit Yugnat. Aucun item n'est masqué automatiquement."
        actions={<RefreshRadarButton />}
      />

      <RadarKpiStrip kpis={feed.kpis} window={window} />

      <RadarViewTabs view={view} counts={feed.counts} />

      <RadarFilters
        window={window}
        sourceId={sourceParam}
        sources={feed.sources}
        windowDisabled={isSavedView}
        windowDisabledHint={`Saved utilise une fenêtre fixe de ${RADAR_SAVED_LOOKBACK_DAYS} jours.`}
      />

      {feed.items.length === 0 ? (
        <EmptyState
          icon={<Radar className="size-5" />}
          title={empty.title}
          description={empty.description}
        />
      ) : (
        <div className="space-y-3">
          {feed.items.map((item) => (
            <RadarItemCard key={item.id} item={item} view={view} />
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
