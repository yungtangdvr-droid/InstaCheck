import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { VerdictBadge, type VerdictBadgeProps } from '@/components/ui/verdict-badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MemeBrief, MemeBriefFitBand } from '@creator-hub/types'

import { BriefStatusActions } from './BriefStatusActions'

const FIT_BAND_TONE: Record<MemeBriefFitBand, NonNullable<VerdictBadgeProps['tone']>> = {
  strong:     'success',
  moderate:   'warning',
  weak:       'neutral',
  off_brand:  'danger',
  unknown:    'neutral',
}

const FIT_BAND_LABEL: Record<MemeBriefFitBand, string> = {
  strong:     'Yugnat fit · strong',
  moderate:   'Yugnat fit · moderate',
  weak:       'Yugnat fit · weak',
  off_brand:  'Yugnat fit · off-brand',
  unknown:    'Yugnat fit · ?',
}

export function BriefCard({ brief }: { brief: MemeBrief }) {
  const band = brief.yugnatFitBand ?? 'unknown'
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          <span className="font-medium text-foreground/80">
            {brief.sourceLabel ?? 'Source inconnue'}
          </span>
          <span aria-hidden>·</span>
          <span>{brief.status}</span>
          {brief.errorMessage ? (
            <VerdictBadge tone="warning" size="sm">Quality guard</VerdictBadge>
          ) : null}
          <VerdictBadge tone={FIT_BAND_TONE[band]} size="sm">
            {FIT_BAND_LABEL[band]}
            {brief.yugnatFit != null ? ` · ${brief.yugnatFit}` : ''}
          </VerdictBadge>
        </div>

        <div className="space-y-1">
          <Link
            href={`/content-lab/briefs/${brief.id}`}
            className="text-base font-semibold leading-snug text-card-foreground hover:underline"
          >
            {brief.signalTitle ?? '(signal sans titre)'}
          </Link>
        </div>

        {brief.culturalTension ? (
          <Section title="Tension">{brief.culturalTension}</Section>
        ) : null}

        {brief.memeCompression ? (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Meme compression</p>
            <p className="text-sm font-medium text-card-foreground">{brief.memeCompression}</p>
          </div>
        ) : null}

        {brief.visualDirection ? (
          <Section title="Visuel">{brief.visualDirection}</Section>
        ) : null}

        <BriefStatusActions briefId={brief.id} status={brief.status} compact />
      </CardContent>

      <CardFooter className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {brief.signalUrl ? (
          <a
            href={brief.signalUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            <ExternalLink />
            Source
          </a>
        ) : null}
        <Link
          href={`/content-lab/briefs/${brief.id}`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        >
          Détails
        </Link>
        <span className="ml-auto truncate">
          {[brief.provider, brief.model, brief.promptVersion].filter(Boolean).join(' · ')}
        </span>
      </CardFooter>
    </Card>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="text-sm text-card-foreground/90">{children}</p>
    </div>
  )
}
