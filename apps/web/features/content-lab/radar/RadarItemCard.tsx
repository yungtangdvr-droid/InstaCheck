'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'

import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { VerdictBadge } from '@/components/ui/verdict-badge'
import { cn } from '@/lib/utils'

import { setDecision } from './actions'
import { humanizeFormat, type RadarFeedRow } from './get-radar-feed'
import { SensitivityChips } from './SensitivityChips'

type RadarItemCardProps = {
  item: RadarFeedRow
}

function formatScore(value: number | null): string {
  if (value == null) return '—'
  return Math.round(value).toString()
}

function formatAge(publishedAt: string | null): string {
  if (!publishedAt) return '—'
  const ts = Date.parse(publishedAt)
  if (Number.isNaN(ts)) return '—'
  const diffMs   = Date.now() - ts
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1)    return 'à l’instant'
  if (diffMins < 60)   return `il y a ${diffMins} min`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24)  return `il y a ${diffHours} h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30)   return `il y a ${diffDays} j`
  const diffMonths = Math.floor(diffDays / 30)
  return `il y a ${diffMonths} mois`
}

function decisionBadge(decision: RadarFeedRow['decision']) {
  if (decision === 'saved')   return <VerdictBadge tone="success">Saved</VerdictBadge>
  if (decision === 'ignored') return <VerdictBadge tone="neutral">Ignored</VerdictBadge>
  return null
}

export function RadarItemCard({ item }: RadarItemCardProps) {
  const [open, setOpen]      = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError]    = useState<string | null>(null)

  function handleDecision(decision: 'saved' | 'ignored') {
    setError(null)
    startTransition(async () => {
      const result = await setDecision(item.id, decision)
      if (result.error) setError(result.error)
    })
  }

  const dimmed = item.decision === 'ignored'
  const recommendedFormat = humanizeFormat(item.recommendedFormat)
  const publishedAbsolute = item.publishedAt
    ? new Date(item.publishedAt).toLocaleString('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : null

  return (
    <Card className={cn('transition-opacity', dimmed && 'opacity-60')}>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start gap-3">
          {item.imageUrl ? (
            // Plain <img> (no next/image) per PR 5: third-party RSS hosts vary
            // and we explicitly avoid maintaining an allowlist or proxy.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-16 shrink-0 rounded-md border border-border bg-muted object-cover"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : null}
          <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span className="font-medium text-foreground/80">{item.sourceLabel}</span>
                <span aria-hidden>·</span>
                <span title={publishedAbsolute ?? undefined}>{formatAge(item.publishedAt)}</span>
                {decisionBadge(item.decision)}
              </div>
              <h3 className="text-base font-semibold leading-snug text-card-foreground">
                {item.title}
              </h3>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className="text-2xl font-semibold leading-none tabular-nums text-card-foreground">
                {formatScore(item.composite)}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                composite /100
              </span>
              {item.feedbackBoost != null && item.feedbackBoost !== 0 ? (
                <span
                  className={cn(
                    'mt-1 text-[10px] font-medium tabular-nums',
                    item.feedbackBoost > 0 ? 'text-success' : 'text-muted-foreground',
                  )}
                  title="Ajustement par tes Save / Ignore récents"
                >
                  {item.feedbackBoost > 0 ? `+${item.feedbackBoost}` : item.feedbackBoost} feedback
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          <Stat label="Meme potential" value={formatScore(item.memePotential)} />
          <Stat label="Yugnat fit"     value={formatScore(item.yugnatFit)} />
          <Stat label="Format" value={recommendedFormat ?? '—'} />
          <Stat label="Timing" value={item.timingWindowHours == null ? '—' : `${item.timingWindowHours} h`} />
        </dl>

        {item.sensitivityContext.length > 0 ? (
          <SensitivityChips items={item.sensitivityContext} max={2} />
        ) : null}

        {open ? <ExpandedDetails item={item} /> : null}

        {error ? <p className="text-xs text-danger">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant={item.decision === 'saved' ? 'default' : 'outline'}
            size="sm"
            disabled={isPending}
            onClick={() => handleDecision('saved')}
          >
            {item.decision === 'saved' ? 'Saved' : 'Save'}
          </Button>
          <Button
            variant={item.decision === 'ignored' ? 'secondary' : 'outline'}
            size="sm"
            disabled={isPending}
            onClick={() => handleDecision('ignored')}
          >
            {item.decision === 'ignored' ? 'Ignored' : 'Ignore'}
          </Button>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            <ExternalLink />
            Open source
          </a>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? <ChevronUp /> : <ChevronDown />}
            {open ? 'Réduire' : 'Détails'}
          </Button>
        </div>
      </CardContent>

      {open && (item.provider || item.model || item.promptVersion) ? (
        <CardFooter className="text-[11px] text-muted-foreground">
          <span className="truncate">
            {[item.provider, item.model, item.promptVersion].filter(Boolean).join(' · ')}
          </span>
        </CardFooter>
      ) : null}
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium text-card-foreground tabular-nums">{value}</dd>
    </div>
  )
}

function ExpandedDetails({ item }: { item: RadarFeedRow }) {
  return (
    <div className="space-y-4 border-t border-border pt-3">
      {item.summary ? (
        <Section title="Résumé">
          <p className="text-sm text-card-foreground/90">{item.summary}</p>
        </Section>
      ) : null}

      {item.whyMemable ? (
        <Section title="Pourquoi mémable">
          <p className="text-sm text-card-foreground/90">{item.whyMemable}</p>
        </Section>
      ) : null}

      {item.captionIdeas.length > 0 ? (
        <Section title="Idées de caption">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-card-foreground/90 marker:text-muted-foreground">
            {item.captionIdeas.map((idea, idx) => (
              <li key={idx}>{idea}</li>
            ))}
          </ol>
        </Section>
      ) : null}

      {item.memeAngles.length > 0 ? (
        <Section title="Angles">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-card-foreground/90 marker:text-muted-foreground">
            {item.memeAngles.map((angle, idx) => (
              <li key={idx}>{angle}</li>
            ))}
          </ol>
        </Section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {item.culturalReferences.length > 0 ? (
          <Section title="Références culturelles">
            <div className="flex flex-wrap gap-1">
              {item.culturalReferences.map((ref) => (
                <VerdictBadge key={ref} tone="info" size="sm">
                  {ref}
                </VerdictBadge>
              ))}
            </div>
          </Section>
        ) : null}

        {item.primaryTheme ? (
          <Section title="Thème">
            <p className="text-sm text-card-foreground/90">{item.primaryTheme}</p>
          </Section>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Section title="Sensitivity (informational)">
          {item.sensitivityContext.length > 0 ? (
            <SensitivityChips items={item.sensitivityContext} />
          ) : (
            <p className="text-xs text-muted-foreground">—</p>
          )}
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <li>Controversy: <span className="text-foreground/80">{item.controversyLevel ?? '—'}</span></li>
            <li>Misinfo risk: <span className="text-foreground/80">{item.misinformationRisk ?? '—'}</span></li>
          </ul>
        </Section>
        <Section title="Cautions">
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            <li>Legal: <span className="text-foreground/80">{item.legalCaution ?? '—'}</span></li>
            <li>Tragedy: <span className="text-foreground/80">{item.tragedyContext ?? '—'}</span></li>
          </ul>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  )
}
