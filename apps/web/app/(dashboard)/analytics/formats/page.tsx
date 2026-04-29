import { createServerSupabaseClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PeriodFilter } from '@/components/analytics/PeriodFilter'
import { FormatMatrix } from '@/components/charts/FormatMatrix'
import { BestWindowHeatmap } from '@/components/charts/BestWindowHeatmap'
import { getFormatBreakdown, getPostingWindows } from '@/features/analytics/get-analytics-data'
import { parsePeriod } from '@/features/analytics/utils'
import { PageHeader } from '@/components/ui/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default async function FormatsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period = parsePeriod(periodParam)

  const supabase = await createServerSupabaseClient()

  const [formatResult, windowResult] = await Promise.all([
    getFormatBreakdown(supabase, period),
    getPostingWindows(supabase, period),
  ])

  const formatData = formatResult.data ?? []
  const windowData = windowResult.data ?? []

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Link href="/analytics" className="transition-colors hover:text-foreground">
              Analytics
            </Link>
            <span aria-hidden>/</span>
            <span>Formats</span>
          </span>
        }
        title="Performances par format"
        description="Reach · Saves · Shares agrégés par type de contenu."
        actions={<PeriodFilter current={period} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Reach · Saves · Shares par format</CardTitle>
          <CardDescription>
            Volume agrégé sur la période sélectionnée. Reach et engagements
            sont graphés séparément pour rester lisibles à la même échelle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormatMatrix data={formatData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meilleurs créneaux de publication</CardTitle>
          <CardDescription>
            Saves moyens par créneau heure × jour, tous formats confondus.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BestWindowHeatmap data={windowData} />
        </CardContent>
      </Card>
    </div>
  )
}
