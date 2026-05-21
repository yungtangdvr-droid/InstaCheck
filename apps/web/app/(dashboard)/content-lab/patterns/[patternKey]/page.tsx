import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getPatternByKey,
  getPatternExamples,
  getPatternExamplePostMeta,
} from '@/features/content-lab/patterns/get-patterns'
import { isValidPatternKey } from '@/features/content-lab/patterns/pattern-key'
import {
  buildPatternHeadline,
  buildPatternReason,
} from '@/features/content-lab/patterns/build-pattern-reason'
import {
  formatPatternLabel,
  humorTypeLabel,
  primaryThemeLabel,
} from '@/features/content-lab/content-analysis-labels'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { VerdictBadge, type VerdictBadgeProps } from '@/components/ui/verdict-badge'
import type {
  TPatternRecommendation,
  TPatternSignalStrength,
} from '@creator-hub/types'

const RECO_TONE: Record<TPatternRecommendation, NonNullable<VerdictBadgeProps['tone']>> = {
  replicate: 'success',
  adapt:     'warning',
  drop:      'danger',
}
const RECO_LABEL: Record<TPatternRecommendation, string> = {
  replicate: 'Répliquer',
  adapt:     'Adapter',
  drop:      'Abandonner',
}
const STRENGTH_TONE: Record<TPatternSignalStrength, NonNullable<VerdictBadgeProps['tone']>> = {
  strong:   'success',
  moderate: 'info',
  weak:     'neutral',
}
const STRENGTH_LABEL: Record<TPatternSignalStrength, string> = {
  strong:   'Fort',
  moderate: 'Modéré',
  weak:     'Faible',
}
const MEDIA_LABEL: Record<string, string> = {
  IMAGE:          'Image',
  VIDEO:          'Vidéo',
  CAROUSEL_ALBUM: 'Carousel',
}

function fmtMultiplier(value: number | null): string {
  if (value == null) return '–'
  return `×${value.toFixed(2)}`
}
function fmtPct(value: number): string {
  return `${Math.round(value * 100)}%`
}

export default async function PatternDetailPage({
  params,
}: {
  params: Promise<{ patternKey: string }>
}) {
  const { patternKey: raw } = await params
  const patternKey = decodeURIComponent(raw)
  if (!isValidPatternKey(patternKey)) notFound()

  const supabase = await createServerSupabaseClient()
  const pattern = await getPatternByKey(supabase, patternKey)
  if (!pattern) notFound()

  const examples = await getPatternExamples(supabase, patternKey)
  const meta     = await getPatternExamplePostMeta(supabase, examples.map((e) => e.postId))

  const reco = pattern.recommendation
  const recoTone  = reco ? RECO_TONE[reco]  : 'neutral'
  const recoLabel = reco ? RECO_LABEL[reco] : 'À évaluer'

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/content-lab" className="hover:text-foreground">
            Content Lab
          </Link>
          <span>/</span>
          <Link href="/content-lab/patterns" className="hover:text-foreground">
            Patterns
          </Link>
          <span>/</span>
          <span>{buildPatternHeadline(pattern)}</span>
        </div>

        <PageHeader
          title={primaryThemeLabel(pattern.primaryTheme)}
          description={`${formatPatternLabel(pattern.formatPattern)} · ${humorTypeLabel(pattern.humorType)} · ${MEDIA_LABEL[pattern.mediaType] ?? pattern.mediaType}`}
          actions={
            <div className="flex items-center gap-2">
              <VerdictBadge tone={STRENGTH_TONE[pattern.signalStrength]}>
                Signal {STRENGTH_LABEL[pattern.signalStrength].toLowerCase()}
              </VerdictBadge>
              <VerdictBadge tone={recoTone}>{recoLabel}</VerdictBadge>
            </div>
          }
        />
      </div>

      <section className="space-y-3">
        <SectionHeader
          title="Pourquoi cette recommandation"
          description="Synthèse calculée à partir des posts de la famille."
        />
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-foreground">
          {buildPatternReason(pattern)}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Agrégats" />
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Échantillon" value={String(pattern.sampleSize)} />
          <Stat label="90 derniers j" value={String(pattern.postsLast90d)} />
          <Stat label="Score ajusté" value={pattern.bayesAdjustedScore.toFixed(1)} />
          <Stat label="Saves moy." value={fmtMultiplier(pattern.meanSavesMultiplier)} />
          <Stat label="Shares moy." value={fmtMultiplier(pattern.meanSharesMultiplier)} />
          <Stat label="% > baseline" value={fmtPct(pattern.shareAboveBaseline)} />
        </dl>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Exemples"
          description="Top posts de cette famille, triés par score de performance."
        />
        {examples.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            Aucun post avec score exploitable.
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {examples.map((ex) => {
              const m = meta.get(ex.postId)
              const caption  = m?.caption?.trim() ?? ''
              const permaUrl = m?.permalink ?? null
              return (
                <li
                  key={ex.postId}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/analytics/post/${ex.postId}`}
                      className="text-xs font-medium text-foreground hover:text-foreground/80"
                    >
                      Score {ex.performanceScore.toFixed(0)}/100
                    </Link>
                    {permaUrl ? (
                      <a
                        href={permaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Instagram ↗
                      </a>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                    {caption.length > 0 ? caption : <em>Sans légende IG</em>}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>Saves {fmtMultiplier(ex.savesMultiplier)}</span>
                    <span>Shares {fmtMultiplier(ex.sharesMultiplier)}</span>
                    {ex.scoreDelta != null && (
                      <span>
                        Δ {ex.scoreDelta > 0 ? '+' : ''}
                        {ex.scoreDelta.toFixed(1)}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-muted-foreground">
        Clé de famille : <code className="rounded bg-muted px-1 py-0.5">{pattern.patternKey}</code>
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base tabular-nums text-foreground">{value}</div>
    </div>
  )
}
