import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PeriodFilter } from '@/components/analytics/PeriodFilter'
import { DataHealthPanel } from '@/components/analytics/DataHealthPanel'
import { AccountEngagementCard } from '@/components/analytics/AccountEngagementCard'
import { ReachChart } from '@/components/charts/ReachChart'
import { SavesChart } from '@/components/charts/SavesChart'
import { PostExplorer } from '@/components/charts/PostExplorer'
import { getReachSeries, getTopPosts } from '@/features/analytics/get-analytics-data'
import { getDataHealth } from '@/features/analytics/get-data-health'
import { getAccountEngagementHealth } from '@/features/analytics/get-engagement-health'
import { getContentSignalsForPosts } from '@/features/content-lab/get-content-analysis'
import { parsePeriod } from '@/features/analytics/utils'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { KpiTile } from '@/components/ui/kpi-tile'
import Link from 'next/link'

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period = parsePeriod(periodParam)

  const supabase = await createServerSupabaseClient()

  const [health, engagement, reachResult, topPostsResult] = await Promise.all([
    getDataHealth(supabase, period),
    getAccountEngagementHealth(supabase, period),
    getReachSeries(supabase, period),
    getTopPosts(supabase, period),
  ])

  const reachData = reachResult.data  ?? []
  const topPosts  = topPostsResult.data ?? []

  // Read-only theme signals from post_content_analysis. Map → Record so the
  // payload serialises cleanly to the client PostExplorer component.
  const signalMap = await getContentSignalsForPosts(supabase, topPosts.map(p => p.id))
  const themesByPostId: Record<string, string | null> = {}
  for (const [postId, signal] of signalMap) {
    themesByPostId[postId] = signal.primaryTheme
  }

  const totalReach = reachData.reduce((s, d) => s + d.reach, 0)
  const totalSaves = reachData.reduce((s, d) => s + d.saves, 0)

  const accountHandle = health.account?.username
    ? `@${health.account.username}`
    : null

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={accountHandle ?? 'Compte non connecté'}
        title="Analytics"
        description="Performances de ton compte Instagram"
        actions={<PeriodFilter current={period} />}
      />

      <section className="space-y-3">
        <SectionHeader
          eyebrow={`${period} j`}
          title="Vue d’ensemble"
          description="Volumes mesurés sur la période active."
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiTile
            label={`Posts (${period} j)`}
            value={health.periodPosts.toLocaleString('fr-FR')}
            hint={
              health.totalPosts > 0
                ? `${health.totalPosts.toLocaleString('fr-FR')} indexés au total`
                : undefined
            }
          />
          <KpiTile
            label={`Reach (${period} j)`}
            value={totalReach > 0 ? totalReach.toLocaleString('fr-FR') : '—'}
          />
          <KpiTile
            label={`Saves (${period} j)`}
            value={totalSaves > 0 ? totalSaves.toLocaleString('fr-FR') : '—'}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Pipeline & sync"
          description="État du compte, du dernier sync Meta et du stock analytics."
        />
        <Card>
          <CardContent className="px-0 pb-0 pt-0">
            <DataHealthPanel health={health} period={period} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Signaux de circulation"
          description="Comment ton audience interagit, comparé à ton propre historique."
        />
        <Card>
          <CardContent className="px-0 pb-0 pt-0">
            <AccountEngagementCard health={engagement} period={period} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Reach & sauvegardes"
          description={`Tendances quotidiennes sur ${period} j.`}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Reach</CardTitle>
            </CardHeader>
            <CardContent>
              <ReachChart data={reachData} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Saves · Shares</CardTitle>
            </CardHeader>
            <CardContent>
              <SavesChart data={reachData} />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title={`Posts — ${period} j`}
          description="Top circulation sur la période."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/analytics/posts?period=${period}`}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Voir tous les posts →
              </Link>
              <Link
                href={`/analytics/formats?period=${period}`}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Vue par format →
              </Link>
              <Link
                href="/analytics/benchmark"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Vue benchmark →
              </Link>
            </div>
          }
        />
        <PostExplorer posts={topPosts} themesByPostId={themesByPostId} />
      </section>
    </div>
  )
}
