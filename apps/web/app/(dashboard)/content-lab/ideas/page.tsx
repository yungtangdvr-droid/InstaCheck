import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { listPatternIdeas, PATTERN_IDEA_LIMIT } from '@/features/content-lab/pattern-ideas/get-pattern-ideas'
import { PatternIdeaCard } from '@/features/content-lab/pattern-ideas/PatternIdeaCard'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

export default async function ContentLabIdeasPage() {
  const supabase = await createServerSupabaseClient()
  const ideas    = await listPatternIdeas(supabase, PATTERN_IDEA_LIMIT)

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/content-lab" className="hover:text-foreground">
            Content Lab
          </Link>
          <span>/</span>
          <span>Idées à tester</span>
        </div>

        <PageHeader
          title="Idées à tester"
          description="Pistes de prochains posts dérivées des familles créatives qui ont déjà sur-performé sur ton compte."
          actions={
            <Link
              href="/content-lab/patterns"
              className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            >
              Voir les familles →
            </Link>
          }
        />
      </div>

      <section className="space-y-3">
        <SectionHeader
          title={`Top ${Math.min(ideas.length, PATTERN_IDEA_LIMIT)} pistes`}
          description="Calculées en lecture seule à partir des familles « répliquer » et « adapter », triées par score ajusté."
        />
        {ideas.length === 0 ? (
          <EmptyState
            title="Aucune idée pour le moment"
            description="Les familles créatives n’ont pas encore atteint le seuil (≥ 4 posts) ou n’ont pas de recommandation actionnable. Reviens après quelques posts supplémentaires."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {ideas.map((idea) => (
              <PatternIdeaCard key={idea.sourcePatternKey} idea={idea} />
            ))}
          </div>
        )}
      </section>

      <p className="text-[11px] text-muted-foreground">
        Lecture seule — aucune idée n’est persistée. La page recalcule à chaque visite à partir des
        agrégats de famille existants.
      </p>
    </div>
  )
}
