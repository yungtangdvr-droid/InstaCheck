import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, ExternalLink } from 'lucide-react'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { VerdictBadge, type VerdictBadgeProps } from '@/components/ui/verdict-badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { asRadarClient } from '@/lib/radar/persist'

import { getBrief } from '@/features/content-lab/briefs/get-briefs'
import { BriefStatusActions } from '@/features/content-lab/briefs/BriefStatusActions'
import type { MemeBriefFitBand } from '@creator-hub/types'

const FIT_BAND_TONE: Record<MemeBriefFitBand, NonNullable<VerdictBadgeProps['tone']>> = {
  strong:     'success',
  moderate:   'warning',
  weak:       'neutral',
  off_brand:  'danger',
  unknown:    'neutral',
}

type Params = Promise<{ id: string }>

export default async function BriefDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const brief = await getBrief(supabase, id)
  if (!brief) notFound()

  const radar = asRadarClient(supabase)
  const radarIds = [
    ...(brief.sourceRadarItemId ? [brief.sourceRadarItemId] : []),
    ...brief.extraRadarItemIds,
  ]
  let radarRows: Array<{ id: string; title: string; url: string; published_at: string | null }> = []
  if (radarIds.length > 0) {
    const { data } = await radar
      .from('radar_items')
      .select('id,title,url,published_at')
      .in('id', radarIds)
    radarRows = data ?? []
  }

  const sourceRow = radarRows.find((r) => r.id === brief.sourceRadarItemId) ?? null
  const siblings  = radarRows.filter((r) => r.id !== brief.sourceRadarItemId)

  const band = brief.yugnatFitBand ?? 'unknown'

  return (
    <div className="space-y-8">
      <Link
        href="/content-lab/briefs"
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'self-start')}
      >
        <ChevronLeft />
        Tous les briefs
      </Link>

      <PageHeader
        eyebrow="Content Lab · Brief"
        title={brief.signalTitle ?? '(signal sans titre)'}
        description={brief.sourceLabel ?? undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <VerdictBadge tone={FIT_BAND_TONE[band]} size="md">
          Yugnat fit · {band}
          {brief.yugnatFit != null ? ` · ${brief.yugnatFit}` : ''}
        </VerdictBadge>
        {brief.suggestedLanguage ? (
          <VerdictBadge tone="info" size="md">Langue · {brief.suggestedLanguage}</VerdictBadge>
        ) : null}
        {brief.freshnessHalfLifeHours != null ? (
          <VerdictBadge tone="neutral" size="md">
            Fresh · {brief.freshnessHalfLifeHours}h
          </VerdictBadge>
        ) : null}
        {brief.errorMessage ? (
          <VerdictBadge tone="warning" size="md">Quality guard</VerdictBadge>
        ) : null}
      </div>

      <BriefStatusActions briefId={brief.id} status={brief.status} />

      <Card>
        <CardContent className="space-y-5 pt-5">
          <Section title="Cultural tension">{brief.culturalTension}</Section>
          <Section title="Underlying feeling">{brief.underlyingFeeling}</Section>
          <Section title="Contradiction">{brief.contradiction}</Section>

          <div className="rounded-md border border-border bg-muted/40 px-3 py-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Meme compression</p>
            <p className="mt-1 text-base font-medium text-card-foreground">
              {brief.memeCompression ?? '—'}
            </p>
          </div>

          <Section title="Visual direction">{brief.visualDirection}</Section>
          <Section title="Caption seed">{brief.captionSeed}</Section>
          <Section title="Why it is memeable">{brief.whyItIsMemeable}</Section>

          {brief.riskOrTimingCaveat ? (
            <Section title="Risque / timing">{brief.riskOrTimingCaveat}</Section>
          ) : null}

          {brief.errorMessage ? (
            <Section title="Quality guard">
              <code className="text-xs">{brief.errorMessage}</code>
            </Section>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Source radar item
          </h3>
          {sourceRow ? (
            <a
              href={sourceRow.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              {sourceRow.title}
              <ExternalLink className="size-3" />
            </a>
          ) : brief.signalUrl ? (
            <a
              href={brief.signalUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              {brief.signalTitle ?? brief.signalUrl}
              <ExternalLink className="size-3" />
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">(source radar absente)</p>
          )}
          {brief.signalSummary ? (
            <p className="text-sm text-card-foreground/90">{brief.signalSummary}</p>
          ) : null}

          {siblings.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Cluster siblings
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {siblings.map((s) => (
                  <li key={s.id}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="hover:underline"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        {[brief.provider, brief.model, brief.promptVersion].filter(Boolean).join(' · ')}
        {brief.inputTokens != null || brief.outputTokens != null
          ? ` · tokens ${brief.inputTokens ?? '?'} → ${brief.outputTokens ?? '?'}`
          : ''}
        {brief.generatedAt ? ` · ${new Date(brief.generatedAt).toLocaleString('fr-FR')}` : ''}
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-sm text-card-foreground/90">{children ?? '—'}</p>
    </div>
  )
}
