import type { DealStage } from '@creator-hub/types'

export const DEAL_STAGES: DealStage[] = [
  'target_identified',
  'outreach_drafted',
  'outreach_sent',
  'opened',
  'replied',
  'concept_shared',
  'negotiation',
  'verbal_yes',
  'won',
  'lost',
  'dormant',
]

export const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  target_identified: 'Target',
  outreach_drafted:  'Outreach drafted',
  outreach_sent:     'Outreach sent',
  opened:            'Opened',
  replied:           'Replied',
  concept_shared:    'Concept shared',
  negotiation:       'Negotiation',
  verbal_yes:        'Verbal yes',
  won:               'Won',
  lost:              'Lost',
  dormant:           'Dormant',
}

export const DEAL_STAGE_BADGE: Record<DealStage, string> = {
  target_identified: 'bg-neutral-800 text-neutral-400',
  outreach_drafted:  'bg-neutral-800 text-neutral-300',
  outreach_sent:     'bg-sky-500/15 text-sky-400',
  opened:            'bg-sky-500/15 text-sky-300',
  replied:           'bg-indigo-500/15 text-indigo-300',
  concept_shared:    'bg-violet-500/15 text-violet-300',
  negotiation:       'bg-amber-500/15 text-amber-400',
  verbal_yes:        'bg-emerald-500/15 text-emerald-300',
  won:               'bg-emerald-500/25 text-emerald-200',
  lost:              'bg-red-500/10 text-red-400',
  dormant:           'bg-neutral-900 text-neutral-500',
}

export function isDealStage(v: string | null | undefined): v is DealStage {
  return DEAL_STAGES.includes(v as DealStage)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined) return '—'
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency ?? 'EUR',
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount} ${currency ?? ''}`.trim()
  }
}

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const diffMs = Date.now() - then
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}
