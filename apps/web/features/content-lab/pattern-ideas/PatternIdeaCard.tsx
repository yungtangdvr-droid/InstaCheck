import Link from 'next/link'
import type { TPatternIdea, TPatternIdeaAction } from '@creator-hub/types'
import { VerdictBadge, type VerdictBadgeProps } from '@/components/ui/verdict-badge'

const ACTION_TONE: Record<TPatternIdeaAction, NonNullable<VerdictBadgeProps['tone']>> = {
  test:    'success',
  adapt:   'warning',
  revisit: 'neutral',
}
const ACTION_LABEL: Record<TPatternIdeaAction, string> = {
  test:    'À tester',
  adapt:   'À adapter',
  revisit: 'À revoir',
}

function fmtMultiplier(value: number | null): string {
  if (value == null) return '–'
  return `×${value.toFixed(2)}`
}
function fmtPct(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function PatternIdeaCard({ idea }: { idea: TPatternIdea }) {
  const { evidence } = idea
  const patternHref  = `/content-lab/patterns/${encodeURIComponent(idea.sourcePatternKey)}`

  return (
    <article className="space-y-4 rounded-lg border border-border bg-card p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-medium text-foreground">{idea.headline}</h3>
          <p className="text-xs text-muted-foreground">
            {idea.suggestedAngle} · {idea.suggestedFormat} · {idea.suggestedTone}
          </p>
        </div>
        <VerdictBadge tone={ACTION_TONE[idea.suggestedAction]} size="md">
          {ACTION_LABEL[idea.suggestedAction]}
        </VerdictBadge>
      </header>

      <section className="space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Pourquoi ça peut marcher
        </p>
        <p className="text-sm text-foreground">{idea.whyItMightWork}</p>
      </section>

      <section className="space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Évidence</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{evidence.sampleSize} posts</span>
          <span>· {evidence.postsLast90d} sur 90 j</span>
          <span>· score {evidence.bayesAdjustedScore.toFixed(0)}/100</span>
          <span>· saves {fmtMultiplier(evidence.meanSavesMultiplier)}</span>
          <span>· shares {fmtMultiplier(evidence.meanSharesMultiplier)}</span>
          <span>· {fmtPct(evidence.shareAboveBaseline)} &gt; baseline</span>
          <span>· signal {evidence.signalStrength}</span>
        </div>
      </section>

      <section className="space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Risque / nuance</p>
        <p className="text-sm text-muted-foreground">{idea.riskCaveat}</p>
      </section>

      {idea.examples.length > 0 && (
        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Exemples ({idea.examples.length})
          </p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {idea.examples.map((ex) => (
              <li
                key={ex.postId}
                className="rounded-md border border-border bg-background p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/analytics/post/${ex.postId}`}
                    className="text-[11px] font-medium text-foreground hover:text-foreground/80"
                  >
                    Score {ex.performanceScore.toFixed(0)}/100
                  </Link>
                  {ex.permalink && (
                    <a
                      href={ex.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      IG ↗
                    </a>
                  )}
                </div>
                <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
                  {ex.captionSnippet ?? <em>Sans légende IG</em>}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                  <span>Saves {fmtMultiplier(ex.savesMultiplier)}</span>
                  <span>Shares {fmtMultiplier(ex.sharesMultiplier)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="flex items-center justify-between border-t border-border pt-3 text-[11px] text-muted-foreground">
        <span>
          Famille source :{' '}
          <code className="rounded bg-muted px-1 py-0.5">{idea.sourcePatternKey}</code>
        </span>
        <Link href={patternHref} className="hover:text-foreground">
          Voir la famille →
        </Link>
      </footer>
    </article>
  )
}
