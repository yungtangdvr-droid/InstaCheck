import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getThemePerformance, THEME_MIN_SAMPLE_SIZE } from './get-content-analysis'
import { primaryThemeLabel } from './content-analysis-labels'

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
    <section>
      <div className="mb-4 flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold text-white">Thèmes qui performent</h2>
          <span className="text-xs text-neutral-500">
            d&apos;après l&apos;analyse de contenu (vocab v2)
          </span>
        </div>
        <p className="text-xs text-neutral-500">
          Classement pondéré par performance et taille d&apos;échantillon.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Aucune analyse de contenu exploitable. Lance d&apos;abord le batch{' '}
          <code className="rounded bg-neutral-900 px-1 py-0.5 text-[11px] text-neutral-400">
            pnpm content:analyze
          </code>
          .
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 bg-neutral-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500">
                  Thème
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-neutral-500"
                  title={`Score brut pondéré par la fiabilité de l'échantillon (Bayesian shrinkage, prior = ${THEME_MIN_SAMPLE_SIZE} posts).`}
                >
                  Score ajusté
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-neutral-500"
                  title={`Fiabilité = post_count / (post_count + ${THEME_MIN_SAMPLE_SIZE}). Plus l'échantillon grandit, plus le score brut domine.`}
                >
                  Fiabilité / posts
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">
                  Moy. saves
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-neutral-500"
                  title="Moyenne des shares — signal dominant de circulation sur ce compte"
                >
                  Moy. shares
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-neutral-500"
                  title="Moyenne du score circulation mart (0–100, baseline-relative)"
                >
                  Moy. score
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500">
                  Top post
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-950">
              {rows.map((row) => {
                const lowSample = row.postCount < THEME_MIN_SAMPLE_SIZE
                const reliabilityPct = Math.round(row.reliability * 100)
                return (
                  <tr key={row.primaryTheme} className={lowSample ? 'opacity-60' : undefined}>
                    <td className="px-4 py-3 text-neutral-200">
                      <div className="flex items-center gap-2">
                        <span>{primaryThemeLabel(row.primaryTheme)}</span>
                        {lowSample && (
                          <span
                            className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
                            title={`Moins de ${THEME_MIN_SAMPLE_SIZE} posts : signal à confirmer.`}
                          >
                            À confirmer
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-200">
                      {row.adjustedScore.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                      <span className="text-neutral-400">{reliabilityPct}%</span>
                      <span className="text-neutral-700"> · </span>
                      <span>{row.postCount} post{row.postCount > 1 ? 's' : ''}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-300">
                      {row.avgSaves.toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-400">
                      {row.avgShares.toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-400">
                      {row.avgScore == null ? '—' : `${row.avgScore}/100`}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {row.topPostId ? (
                        <Link
                          href={`/analytics/post/${row.topPostId}`}
                          className="text-xs text-neutral-400 transition-colors hover:text-neutral-200"
                        >
                          Voir →
                        </Link>
                      ) : (
                        <span className="text-xs text-neutral-700">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="border-t border-neutral-800 bg-neutral-900/50 px-4 py-2 text-[11px] text-neutral-600">
            Score ajusté = score brut × fiabilité + moyenne globale × (1 − fiabilité),
            avec fiabilité = posts / (posts + {THEME_MIN_SAMPLE_SIZE}). Les thèmes
            <code className="mx-1">unknown</code> et non classés sont exclus.
          </p>
        </div>
      )}
    </section>
  )
}
