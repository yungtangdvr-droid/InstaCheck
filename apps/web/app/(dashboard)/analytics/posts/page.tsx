import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PeriodFilter } from '@/components/analytics/PeriodFilter'
import { AnalyzeNewButton } from '@/components/analytics/AnalyzeNewButton'
import { ChronologicalPostsTable } from '@/components/analytics/ChronologicalPostsTable'
import { getChronologicalPosts } from '@/features/analytics/get-chronological-posts'
import { parsePeriod } from '@/features/analytics/utils'
import { PageHeader } from '@/components/ui/page-header'

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
    <div className="space-y-10">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Link
              href={`/analytics?period=${period}`}
              className="transition-colors hover:text-foreground"
            >
              Analytics
            </Link>
            <span aria-hidden>/</span>
            <span>Posts chronologiques</span>
          </span>
        }
        title="Posts chronologiques"
        description="Tous les posts de la période ordonnés par date de publication."
        actions={
          <div className="flex items-start gap-2">
            <AnalyzeNewButton variant="compact" />
            <PeriodFilter current={period} />
          </div>
        }
      />

      <ChronologicalPostsTable posts={posts} />
    </div>
  )
}
