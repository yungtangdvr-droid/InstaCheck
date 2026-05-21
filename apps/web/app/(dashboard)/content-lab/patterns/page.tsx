import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { listPatterns } from '@/features/content-lab/patterns/get-patterns'
import { PatternListTable } from '@/features/content-lab/patterns/PatternListTable'
import {
  PatternListFilters,
  type TPatternFormatFilter,
  type TPatternRecommendationFilter,
  type TPatternStrengthFilter,
} from '@/features/content-lab/patterns/PatternListFilters'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

function parseReco(value: string | undefined): TPatternRecommendationFilter {
  if (value === 'replicate' || value === 'adapt' || value === 'drop') return value
  return 'all'
}
function parseStrength(value: string | undefined): TPatternStrengthFilter {
  if (value === 'strong' || value === 'moderate' || value === 'weak') return value
  return 'all'
}
function parseFormat(value: string | undefined): TPatternFormatFilter {
  if (value === 'IMAGE' || value === 'VIDEO' || value === 'CAROUSEL_ALBUM') return value
  return 'ALL'
}

export default async function PatternsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ reco?: string; strength?: string; format?: string }>
}) {
  const sp = await searchParams
  const reco     = parseReco(sp.reco)
  const strength = parseStrength(sp.strength)
  const format   = parseFormat(sp.format)

  const supabase = await createServerSupabaseClient()
  const all = await listPatterns(supabase)

  const filtered = all.filter((p) => {
    if (reco     !== 'all' && p.recommendation !== reco)            return false
    if (strength !== 'all' && p.signalStrength !== strength)        return false
    if (format   !== 'ALL' && p.mediaType      !== format)          return false
    return true
  })

  // Surface evidence-strong rows first; the suppressed bucket lives in its
  // own section so the operator can see them but they don't compete with
  // recommendations.
  const evidenced  = filtered.filter((p) => p.recommendation != null)
  const suppressed = filtered.filter((p) => p.recommendation == null)

  return (
    <div className="space-y-8">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/content-lab" className="hover:text-foreground">
          Content Lab
        </Link>
        <span>/</span>
        <span>Patterns</span>
      </div>

      <PageHeader
        title="Creative patterns"
        description="Familles créatives récurrentes détectées dans tes posts (thème × format × humour × média)."
      />

      <PatternListFilters
        recommendation={reco}
        strength={strength}
        format={format}
      />

      <section className="space-y-3">
        <SectionHeader
          title="Familles avec évidence"
          description="Triées par score ajusté Bayesian — les familles à petit échantillon sont pondérées vers la moyenne du compte."
        />
        {evidenced.length === 0 ? (
          <EmptyState
            title="Aucune famille avec évidence"
            description="Aucun pattern n'a au moins 4 posts dans la sélection courante."
          />
        ) : (
          <PatternListTable patterns={evidenced} />
        )}
      </section>

      {suppressed.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            title="Échantillon insuffisant"
            description="Familles avec moins de 4 posts. Affichées pour contexte ; pas de recommandation tant que la famille ne grandit pas."
          />
          <PatternListTable patterns={suppressed} />
        </section>
      )}
    </div>
  )
}
