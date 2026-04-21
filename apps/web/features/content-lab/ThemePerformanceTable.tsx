// PROVISIONAL: theme performance is computed inline by joining post_tags with post_metrics_daily.
// Replace the body of this component with a mart_theme_performance query
// once the dbt sprint that seeds that mart is complete. The component interface stays the same.
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ThemeAggregate } from '@creator-hub/types'

const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10)

export async function ThemePerformanceTable() {
  const supabase = await createServerSupabaseClient()

  const { data: taggedPosts } = await supabase
    .from('post_tags')
    .select('post_id, tag')

  if (!taggedPosts || taggedPosts.length === 0) {
    return (
      <section>
        <SectionHeader />
        <p className="text-sm text-neutral-500">
          Tague tes posts pour voir les performances par thème.
        </p>
      </section>
    )
  }

  const postIds = [...new Set(taggedPosts.map((t) => t.post_id))]

  const { data: metrics } = await supabase
    .from('post_metrics_daily')
    .select('post_id, saves, reach')
    .in('post_id', postIds)
    .gte('date', THIRTY_DAYS_AGO)

  const sumsByPost = new Map<string, { saves: number; reach: number }>()
  for (const m of metrics ?? []) {
    const cur = sumsByPost.get(m.post_id) ?? { saves: 0, reach: 0 }
    sumsByPost.set(m.post_id, {
      saves: cur.saves + (m.saves ?? 0),
      reach: cur.reach + (m.reach ?? 0),
    })
  }

  const byTag = new Map<string, { totalSaves: number; totalReach: number; postCount: number }>()
  for (const { post_id, tag } of taggedPosts) {
    const m = sumsByPost.get(post_id)
    if (!m) continue
    const cur = byTag.get(tag) ?? { totalSaves: 0, totalReach: 0, postCount: 0 }
    byTag.set(tag, {
      totalSaves: cur.totalSaves + m.saves,
      totalReach: cur.totalReach + m.reach,
      postCount:  cur.postCount  + 1,
    })
  }

  const aggregates: ThemeAggregate[] = [...byTag.entries()]
    .map(([themeName, v]) => ({
      themeName,
      postCount: v.postCount,
      avgSaves:  v.postCount > 0 ? Math.round(v.totalSaves / v.postCount) : 0,
      avgReach:  v.postCount > 0 ? Math.round(v.totalReach / v.postCount) : 0,
    }))
    .sort((a, b) => b.avgSaves - a.avgSaves)

  if (aggregates.length === 0) {
    return (
      <section>
        <SectionHeader />
        <p className="text-sm text-neutral-500">
          Aucune donnée de métriques pour les posts tagués.
        </p>
      </section>
    )
  }

  return (
    <section>
      <SectionHeader />
      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 bg-neutral-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500">Thème</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">Posts</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">Moy. saves</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">Moy. reach</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {aggregates.map((row) => (
              <tr key={row.themeName}>
                <td className="px-4 py-3 text-neutral-300">{row.themeName}</td>
                <td className="px-4 py-3 text-right text-neutral-500">{row.postCount}</td>
                <td className="px-4 py-3 text-right text-neutral-300">{row.avgSaves}</td>
                <td className="px-4 py-3 text-right text-neutral-300">{row.avgReach}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SectionHeader() {
  return (
    <div className="mb-4 flex items-baseline gap-2">
      <h2 className="text-lg font-semibold text-white">Performance par thème</h2>
      <span className="text-xs text-neutral-600">provisoire — remplacé par mart_theme_performance</span>
    </div>
  )
}
