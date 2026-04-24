import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ThemeAggregate } from '@creator-hub/types'

export async function ThemePerformanceTable() {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('v_mart_theme_performance')
    .select('theme_name, post_count, avg_saves_per_post, avg_reach_per_post, low_sample_flag')
    .eq('period_days', 30)
    .order('avg_saves_per_post', { ascending: false })

  if (error || !data || data.length === 0) {
    return (
      <section>
        <SectionHeader />
        <p className="text-sm text-neutral-500">
          Tague tes posts pour voir les performances par thème.
        </p>
      </section>
    )
  }

  const aggregates: ThemeAggregate[] = data.map(r => ({
    themeName:     r.theme_name ?? '',
    postCount:     r.post_count ?? 0,
    avgSaves:      r.avg_saves_per_post ?? 0,
    avgReach:      r.avg_reach_per_post ?? 0,
    lowSampleFlag: r.low_sample_flag ?? false,
  }))

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
              <tr key={row.themeName} className={row.lowSampleFlag ? 'opacity-60' : undefined}>
                <td className="px-4 py-3 text-neutral-300">
                  {row.themeName}
                  {row.lowSampleFlag && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-neutral-600">
                      faible échantillon
                    </span>
                  )}
                </td>
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
    </div>
  )
}
