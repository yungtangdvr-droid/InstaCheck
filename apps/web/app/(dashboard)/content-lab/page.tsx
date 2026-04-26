import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { WhatToDoNext } from '@/features/content-lab/WhatToDoNext'
import { ThemePerformanceTable } from '@/features/content-lab/ThemePerformanceTable'
import { ContentThemePerformance } from '@/features/content-lab/ContentThemePerformance'
import type { ContentRecommendationType } from '@creator-hub/types'

const TYPE_BADGE: Record<ContentRecommendationType, string> = {
  replicate: 'bg-emerald-500/20 text-emerald-400',
  adapt:     'bg-yellow-500/20 text-yellow-400',
  drop:      'bg-red-500/20 text-red-400',
}

const TYPE_LABEL: Record<ContentRecommendationType, string> = {
  replicate: 'Répliquer',
  adapt:     'Adapter',
  drop:      'Abandonner',
}

export default async function ContentLabPage() {
  const supabase = await createServerSupabaseClient()

  const { data: recommendations } = await supabase
    .from('content_recommendations')
    .select('id, post_id, type, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-white">Content Lab</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Analyse tes formats, optimise ta stratégie éditoriale
        </p>
      </div>

      <WhatToDoNext />

      <ContentThemePerformance />

      <ThemePerformanceTable />

      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">Hypothèses récentes</h2>
        {!recommendations || recommendations.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucune recommandation générée.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recommendations.map((r) => {
              const type = r.type as ContentRecommendationType
              return (
                <Link
                  key={r.id}
                  href={`/content-lab/hypothesis/${r.id}`}
                  className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 transition-colors hover:border-neutral-700"
                >
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      TYPE_BADGE[type] ?? 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {TYPE_LABEL[type] ?? type}
                  </span>
                  <span className="flex-1 truncate text-sm text-neutral-300">
                    {r.reason ?? '—'}
                  </span>
                  <span className="text-xs text-neutral-600">
                    {new Date(r.created_at).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
