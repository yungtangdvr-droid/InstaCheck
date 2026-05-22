import { Sparkles } from 'lucide-react'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'

import { getBriefs, getBriefCounts } from '@/features/content-lab/briefs/get-briefs'
import {
  BriefTabs,
  DEFAULT_BRIEF_VIEW,
  isBriefView,
  type BriefView,
} from '@/features/content-lab/briefs/BriefTabs'
import { BriefCard } from '@/features/content-lab/briefs/BriefCard'

type SearchParams = Promise<{ view?: string }>

const EMPTY: Record<BriefView, { title: string; description: string }> = {
  draft: {
    title:       'Aucun brief en draft',
    description: 'Génère des briefs depuis le Meme Radar (bouton « Generate brief » sur une carte).',
  },
  kept: {
    title:       'Aucun brief gardé',
    description: 'Passe un draft en « Keep » pour l’épingler ici.',
  },
  all: {
    title:       'Aucun brief',
    description: 'Aucun brief n’a encore été généré.',
  },
}

export default async function BriefsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp   = await searchParams
  const view: BriefView = isBriefView(sp.view) ? sp.view : DEFAULT_BRIEF_VIEW

  const supabase = await createServerSupabaseClient()
  const [briefs, counts] = await Promise.all([
    getBriefs(supabase, view === 'all' ? 'all' : view),
    getBriefCounts(supabase),
  ])

  const empty = EMPTY[view]

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Content Lab"
        title="Meme Briefs"
        description="Briefs structurés tirés du Meme Radar : tension culturelle → compression meme → direction visuelle. L’archive ne sert qu’à filtrer le Yugnat fit."
      />

      <BriefTabs view={view} counts={counts} />

      {briefs.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="size-5" />}
          title={empty.title}
          description={empty.description}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {briefs.map((brief) => (
            <BriefCard key={brief.id} brief={brief} />
          ))}
        </div>
      )}
    </div>
  )
}
