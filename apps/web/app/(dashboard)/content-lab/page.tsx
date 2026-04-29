import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { WhatToDoNext } from '@/features/content-lab/WhatToDoNext'
// `ThemePerformanceTable` (manual-tag aggregate from v_mart_theme_performance)
// is intentionally not rendered here: it overlapped with the new Content
// Intelligence taxonomy surfaced by `ContentThemePerformance` and was
// confusing the reading. The component stays in the codebase for a possible
// future "Tags manuels" view.
import { ContentThemePerformance } from '@/features/content-lab/ContentThemePerformance'
import type { ContentRecommendationType } from '@creator-hub/types'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { VerdictBadge, type VerdictBadgeProps } from '@/components/ui/verdict-badge'
import { EmptyState } from '@/components/ui/empty-state'

const TYPE_TONE: Record<ContentRecommendationType, NonNullable<VerdictBadgeProps['tone']>> = {
  replicate: 'success',
  adapt:     'warning',
  drop:      'danger',
}

const TYPE_LABEL: Record<ContentRecommendationType, string> = {
  replicate: 'Répliquer',
  adapt:     'Adapter',
  drop:      'Abandonner',
}

export default async function ContentLabPage() {
  const supabase = await createServerSupabaseClient()

  const { data: recommendations } = await supabase
    .from('content_recommendations')
    .select('id, post_id, type, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <div className="space-y-10">
      <PageHeader
        title="Content Lab"
        description="Analyse tes formats, optimise ta stratégie éditoriale."
        actions={
          <Link
            href="/content-lab/themes"
            className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
          >
            Explorer les thèmes →
          </Link>
        }
      />

      <WhatToDoNext />

      <ContentThemePerformance />

      <section className="space-y-3">
        <SectionHeader
          title="Hypothèses récentes"
          description="Dernières recommandations générées à partir des posts indexés."
        />
        {!recommendations || recommendations.length === 0 ? (
          <EmptyState
            title="Aucune recommandation générée"
            description="Les hypothèses apparaîtront ici dès qu'un post performant sera détecté."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {recommendations.map((r) => {
              const type = r.type as ContentRecommendationType
              const tone = TYPE_TONE[type] ?? 'neutral'
              const label = TYPE_LABEL[type] ?? type
              return (
                <Link
                  key={r.id}
                  href={`/content-lab/hypothesis/${r.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  <VerdictBadge tone={tone}>{label}</VerdictBadge>
                  <span className="flex-1 truncate text-sm text-card-foreground">
                    {r.reason ?? '—'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
