import type { AutomationStatus, CanonicalAutomationName } from '@creator-hub/types'
import { CANONICAL_AUTOMATIONS } from '@creator-hub/types'

const AUTOMATION_STATUSES: readonly AutomationStatus[] = ['success', 'failed', 'skipped'] as const

export function isAutomationStatus(value: unknown): value is AutomationStatus {
  return typeof value === 'string' && (AUTOMATION_STATUSES as readonly string[]).includes(value)
}

export function isCanonicalAutomation(name: string): name is CanonicalAutomationName {
  return (CANONICAL_AUTOMATIONS as readonly string[]).includes(name)
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

/**
 * ISO week start: Monday 00:00:00.000 UTC of the week containing `date`.
 * Used so weekly_summaries has a stable, unique week_start key.
 */
export function isoWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayIdx = (d.getUTCDay() + 6) % 7   // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - dayIdx)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export function isoWeekStartDateStr(date: Date): string {
  return isoWeekStart(date).toISOString().slice(0, 10)
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime())
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

export function formatRelative(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
