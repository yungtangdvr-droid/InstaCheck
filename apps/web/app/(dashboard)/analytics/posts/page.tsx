import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PeriodFilter } from '@/components/analytics/PeriodFilter'
import { AnalyzeNewButton } from '@/components/analytics/AnalyzeNewButton'
import { ChronologicalPostsTable } from '@/components/analytics/ChronologicalPostsTable'
import { getChronologicalPosts } from '@/features/analytics/get-chronological-posts'
import { parsePeriod } from '@/features/analytics/utils'

export default async function ChronologicalPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period = parsePeriod(periodParam)

  const supabase = await createServerSupabaseClient()
  const posts = await getChronologicalPosts(supabase, period)

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs text-neutral-500">
            <Link href={`/analytics?period=${period}`} className="hover:text-neutral-300">
              Analytics
            </Link>
            <span>/</span>
            <span>Posts chronologiques</span>
          </div>
          <h1 className="text-2xl font-semibold text-white">Posts chronologiques</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Tous les posts de la période ordonnés par date de publication
          </p>
        </div>
        <div className="flex items-start gap-3">
          <AnalyzeNewButton variant="compact" />
          <PeriodFilter current={period} />
        </div>
      </div>

      <ChronologicalPostsTable posts={posts} />
    </div>
  )
}
