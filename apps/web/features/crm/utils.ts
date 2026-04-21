import type { BrandStatus, TouchpointType, TaskStatus } from '@creator-hub/types'

export const BRAND_STATUSES: BrandStatus[] = ['cold', 'warm', 'intro', 'active']

export const BRAND_STATUS_LABEL: Record<BrandStatus, string> = {
  cold:   'Cold',
  warm:   'Warm',
  intro:  'Intro',
  active: 'Active',
}

export const BRAND_STATUS_BADGE: Record<BrandStatus, string> = {
  cold:   'bg-neutral-800 text-neutral-400',
  warm:   'bg-amber-500/15 text-amber-400',
  intro:  'bg-sky-500/15 text-sky-400',
  active: 'bg-emerald-500/15 text-emerald-400',
}

export const TOUCHPOINT_TYPES: TouchpointType[] = ['email', 'dm', 'call', 'meeting', 'other']

export const TOUCHPOINT_LABEL: Record<TouchpointType, string> = {
  email:   'Email',
  dm:      'DM',
  call:    'Appel',
  meeting: 'Meeting',
  other:   'Autre',
}

export const TASK_STATUSES: TaskStatus[] = ['todo', 'done', 'snoozed']

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo:    'À faire',
  done:    'Fait',
  snoozed: 'En pause',
}

export function isBrandStatus(v: string | null | undefined): v is BrandStatus {
  return v === 'cold' || v === 'warm' || v === 'intro' || v === 'active'
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}
