import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getThemePerformance, THEME_MIN_SAMPLE_SIZE } from './get-content-analysis'
import { primaryThemeLabel } from './content-analysis-labels'
import { SectionHeader } from '@/components/ui/section-header'
import { VerdictBadge } from '@/components/ui/verdict-badge'
import { EmptyState } from '@/components/ui/empty-state'

// Tooltip used both on the small-sample badge and on the explanatory footer
// note. Kept as a single source so the two surfaces stay in sync.
const LOW_SAMPLE_TOOLTIP =
  `Moins de ${THEME_MIN_SAMPLE_SIZE} posts dans ce thème : le score est pondéré vers la moyenne globale.`

// Read-only aggregate of post_content_analysis × v_mart_post_performance.
// Surfaces which Gemini-classified themes circulate the most on this account.
//
// Sort key is the Bayesian-shrunk `adjustedScore`, not raw avg shares: low
// sample sizes are pulled toward the global average so a single viral post
// can't carry an entire theme to the top of the ranking.
//
// Distinct from <ThemePerformanceTable /> (manual tag aggregate). The
// tag-based view is currently hidden from /content-lab to avoid confusion
// with this Content Intelligence taxonomy.
export async function ContentThemePerformance() {
  const supabase = await createServerSupabaseClient()
  const rows = await getThemePerformance(supabase)

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Thèmes qui performent"
        description="Classement pondéré par performance et taille d'échantillon (analyse de contenu, vocab v2)."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Aucune analyse de contenu exploitable"
          description={
            <>
              Lance d&apos;abord le batch{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">
                pnpm content:analyze
              </code>
              .
            </>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Thème
                </th>
                <th
                  className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  title={`Score brut pondéré par la fiabilité de l'échantillon (Bayesian shrinkage, prior = ${THEME_MIN_SAMPLE_SIZE} posts).`}
                >
                  Score ajusté
                </th>
                <th
                  className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  title={`Fiabilité = post_count / (post_count + ${THEME_MIN_SAMPLE_SIZE}). Plus l'échantillon grandit, plus le score brut domine.`}
                >
                  Fiabilité / posts
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Moy. saves
                </th>
                <th
                  className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  title="Moyenne des shares — signal dominant de circulation sur ce compte"
                >
                  Moy. shares
                </th>
                <th
                  className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  title="Moyenne du score circulation mart (0–100, baseline-relative)"
                >
                  Moy. score
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Top post
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const lowSample = row.postCount < THEME_MIN_SAMPLE_SIZE
                const reliabilityPct = Math.round(row.reliability * 100)
                return (
                  <tr key={row.primaryTheme} className={`transition-colors hover:bg-muted/30 ${lowSample ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 text-foreground">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/content-lab/themes/${encodeURIComponent(row.primaryTheme)}`}
                          className="hover:text-foreground/80"
                          title="Voir tous les posts de ce thème"
                        >
                          {primaryThemeLabel(row.primaryTheme)}
                        </Link>
                        {lowSample && (
                          <span title={LOW_SAMPLE_TOOLTIP}>
                            <VerdictBadge tone="warning">Signal à confirmer</VerdictBadge>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {row.adjustedScore.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      <span className="text-foreground">{reliabilityPct}%</span>
                      <span className="text-muted-foreground"> · </span>
                      <span>{row.postCount} post{row.postCount > 1 ? 's' : ''}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {row.avgSaves.toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-warning">
                      {row.avgShares.toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {row.avgScore == null ? '—' : `${row.avgScore}/100`}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.topPostId ? (
                        <Link
                          href={`/analytics/post/${row.topPostId}`}
                          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Voir →
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="space-y-1 border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
            <p>
              <span className="text-foreground">Comment lire le classement :</span> les
              thèmes sont triés par <em>score ajusté</em>, pas par moyenne brute. Un
              thème avec très peu de posts est tiré vers la moyenne globale pour
              éviter qu&apos;un seul post viral le hisse en tête.
            </p>
            <p>
              <code className="mr-1">score ajusté = score brut × fiabilité + moyenne globale × (1 − fiabilité)</code>
              avec fiabilité = posts / (posts + {THEME_MIN_SAMPLE_SIZE}). Les thèmes
              <code className="mx-1">unknown</code> ou non classés sont exclus.
            </p>
            <p title={LOW_SAMPLE_TOOLTIP}>
              Le badge <span className="text-warning">Signal à confirmer</span>{' '}
              s&apos;affiche dès qu&apos;un thème compte moins de {THEME_MIN_SAMPLE_SIZE} posts.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
