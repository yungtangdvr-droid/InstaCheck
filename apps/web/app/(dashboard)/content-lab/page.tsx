import Link from 'next/link'
import { Radar } from 'lucide-react'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { WhatToDoNext } from '@/features/content-lab/WhatToDoNext'
import { ContentThemePerformance } from '@/features/content-lab/ContentThemePerformance'
import { listPatternIdeas } from '@/features/content-lab/pattern-ideas/get-pattern-ideas'
import { PatternIdeaCard } from '@/features/content-lab/pattern-ideas/PatternIdeaCard'
import { listPatterns } from '@/features/content-lab/patterns/get-patterns'
import {
  buildPatternHeadline,
  buildPatternReason,
} from '@/features/content-lab/patterns/build-pattern-reason'
import type {
  ContentRecommendationType,
  TCreativePattern,
} from '@creator-hub/types'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { VerdictBadge, type VerdictBadgeProps } from '@/components/ui/verdict-badge'
import { EmptyState } from '@/components/ui/empty-state'

const COCKPIT_IDEA_LIMIT          = 4
const COCKPIT_PATTERN_LIMIT       = 3
const COCKPIT_RECOMMENDATION_LIMIT = 5

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

const PATTERN_TONE: Record<NonNullable<TCreativePattern['recommendation']>, NonNullable<VerdictBadgeProps['tone']>> = {
  replicate: 'success',
  adapt:     'warning',
  drop:      'danger',
}

const PATTERN_LABEL: Record<NonNullable<TCreativePattern['recommendation']>, string> = {
  replicate: 'Répliquer',
  adapt:     'Adapter',
  drop:      'Abandonner',
}

// Cockpit-only ordering: replicate first, then adapt, then by Bayes desc.
// `drop` and `null` are excluded — the cockpit shows what to DO next, not
// what to avoid. The full ranking (including drop/insufficient evidence)
// remains on /content-lab/patterns.
function pickRisingPatterns(patterns: TCreativePattern[]): TCreativePattern[] {
  const candidates = patterns.filter(
    (p) => p.recommendation === 'replicate' || p.recommendation === 'adapt',
  )
  candidates.sort((a, b) => {
    const aRep = a.recommendation === 'replicate' ? 0 : 1
    const bRep = b.recommendation === 'replicate' ? 0 : 1
    if (aRep !== bRep) return aRep - bRep
    if (a.bayesAdjustedScore !== b.bayesAdjustedScore) {
      return b.bayesAdjustedScore - a.bayesAdjustedScore
    }
    return b.sampleSize - a.sampleSize
  })
  return candidates.slice(0, COCKPIT_PATTERN_LIMIT)
}

export default async function ContentLabPage() {
  const supabase = await createServerSupabaseClient()

  const [ideas, allPatterns, recosRes] = await Promise.all([
    listPatternIdeas(supabase, COCKPIT_IDEA_LIMIT),
    listPatterns(supabase),
    supabase
      .from('content_recommendations')
      .select('id, post_id, type, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(COCKPIT_RECOMMENDATION_LIMIT),
  ])

  const risingPatterns = pickRisingPatterns(allPatterns)
  const recommendations = recosRes.data ?? []

  return (
    <div className="space-y-10">
      <PageHeader
        title="Content Lab"
        description="Décide quoi poster ensuite : idées à tester, familles qui montent, posts à répliquer."
      />

      {/* 1 — À tester maintenant ------------------------------------------ */}
      <section className="space-y-4">
        <SectionHeader
          title="À tester maintenant"
          description="Pistes de prochains posts dérivées des familles créatives qui sur-performent."
          actions={
            <Link
              href="/content-lab/ideas"
              className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            >
              Voir toutes les idées →
            </Link>
          }
        />
        {ideas.length === 0 ? (
          <EmptyState
            title="Aucune idée disponible"
            description="Les pistes apparaîtront ici dès qu'une famille créative aura assez d'évidence."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {ideas.map((idea) => (
              <PatternIdeaCard key={idea.sourcePatternKey} idea={idea} />
            ))}
          </div>
        )}
      </section>

      {/* 2 — Patterns qui montent ---------------------------------------- */}
      <section className="space-y-4">
        <SectionHeader
          title="Patterns qui montent"
          description="Top familles créatives à répliquer ou adapter."
          actions={
            <Link
              href="/content-lab/patterns"
              className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            >
              Explorer toutes les familles →
            </Link>
          }
        />
        {risingPatterns.length === 0 ? (
          <EmptyState
            title="Aucune famille en hausse"
            description="Aucune famille n'a encore atteint le seuil de recommandation (4 posts mini)."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {risingPatterns.map((p) => {
              const reco = p.recommendation!
              return (
                <Link
                  key={p.patternKey}
                  href={`/content-lab/patterns/${encodeURIComponent(p.patternKey)}`}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  <div className="flex items-center gap-3">
                    <VerdictBadge tone={PATTERN_TONE[reco]}>
                      {PATTERN_LABEL[reco]}
                    </VerdictBadge>
                    <span className="flex-1 truncate text-sm font-medium text-foreground">
                      {buildPatternHeadline(p)}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      score {p.bayesAdjustedScore.toFixed(0)}/100
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{buildPatternReason(p)}</p>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* 3 — À répliquer / adapter / abandonner -------------------------- */}
      <section className="space-y-6">
        <SectionHeader
          title="À répliquer / adapter / abandonner"
          description="Posts performants à rejouer et hypothèses récentes triées par verdict."
        />

        <WhatToDoNext />

        <div className="space-y-3">
          <SectionHeader
            as="h3"
            title="Hypothèses récentes"
            description="Dernières recommandations générées à partir des posts indexés."
          />
          {recommendations.length === 0 ? (
            <EmptyState
              title="Aucune recommandation générée"
              description="Les hypothèses apparaîtront ici dès qu'un post performant sera détecté."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {recommendations.map((r) => {
                const type  = r.type as ContentRecommendationType
                const tone  = TYPE_TONE[type] ?? 'neutral'
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
                        day:   '2-digit',
                        month: 'short',
                      })}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* 4 — Inspiration externe ----------------------------------------- */}
      <section className="space-y-3">
        <SectionHeader
          title="Inspiration externe"
          description="Memes et formats observés ailleurs, classés par fenêtre de viralité."
        />
        <Link
          href="/content-lab/radar"
          className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:bg-accent/50"
        >
          <span
            aria-hidden
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"
          >
            <Radar className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium text-foreground">Meme Radar</span>
            <span className="block text-xs text-muted-foreground">
              Parcours les memes externes par fenêtre, sauvegarde ceux à adapter.
            </span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">Ouvrir →</span>
        </Link>
      </section>

      {/* 5 — Contexte plus profond : performance par thème --------------- */}
      <ContentThemePerformance />

      {/* Discreet back-office footer -------------------------------------- */}
      <footer className="border-t border-[color:var(--surface-border)] pt-4">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Back-office
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li>
            <Link href="/content-lab/themes" className="hover:text-foreground">
              Thèmes (index)
            </Link>
          </li>
          <li>
            <Link href="/content-lab/taxonomy" className="hover:text-foreground">
              Taxonomie
            </Link>
          </li>
          <li>
            <Link href="/content-lab/archive" className="hover:text-foreground">
              Archive
            </Link>
          </li>
          <li>
            <Link href="/content-lab/archive/review" className="hover:text-foreground">
              Archive — review
            </Link>
          </li>
          <li>
            <Link href="/content-lab/archive/coverage" className="hover:text-foreground">
              Archive — coverage
            </Link>
          </li>
        </ul>
      </footer>
    </div>
  )
}
