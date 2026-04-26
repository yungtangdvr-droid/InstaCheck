import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getThemePerformance } from './get-content-analysis'
import { primaryThemeLabel } from './content-analysis-labels'

// Read-only aggregate of post_content_analysis × v_mart_post_performance.
// Surfaces which Gemini-classified themes circulate the most on this account.
// Sorted by avg_shares (the dominant distribution signal in v2 scoring).
//
// Distinct from <ThemePerformanceTable /> which aggregates by manual tag /
// content_themes — both views are kept side by side because tags and the
// auto-classified primary_theme are deliberately different lenses.
export async function ContentThemePerformance() {
  const supabase = await createServerSupabaseClient()
  const rows = await getThemePerformance(supabase)

  return (
    <section>
      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="text-lg font-semibold text-white">Thèmes qui performent</h2>
        <span className="text-xs text-neutral-500">
          d&apos;après l&apos;analyse de contenu (vocab v2)
        </span>
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
                <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">
                  Posts
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">
                  Moy. reach
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
              {rows.map((row) => (
                <tr key={row.primaryTheme}>
                  <td className="px-4 py-3 text-neutral-200">
                    {primaryThemeLabel(row.primaryTheme)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                    {row.postCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-300">
                    {row.avgReach.toLocaleString('fr-FR')}
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
              ))}
            </tbody>
          </table>
          <p className="border-t border-neutral-800 bg-neutral-900/50 px-4 py-2 text-[11px] text-neutral-600">
            Trié par shares moyens. Les thèmes <code>unknown</code> et non
            classés sont exclus.
          </p>
        </div>
      )}
    </section>
  )
}
