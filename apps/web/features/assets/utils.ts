import type { AssetEventType, AssetType } from '@creator-hub/types'

export const ASSET_TYPES: AssetType[] = [
  'creator_deck',
  'case_study',
  'concept',
  'proposal',
  'media_kit',
  'pitch',
]

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  creator_deck: 'Creator deck',
  case_study:   'Case study',
  concept:      'Concept',
  proposal:     'Proposition',
  media_kit:    'Media kit',
  pitch:        'Pitch',
}

export const ASSET_EVENT_TYPES: AssetEventType[] = ['opened', 'completed', 'clicked']

export const ASSET_EVENT_TYPE_LABEL: Record<AssetEventType, string> = {
  opened:    'Ouvert',
  completed: 'Terminé',
  clicked:   'Clic',
}

export const ASSET_EVENT_BADGE: Record<AssetEventType, string> = {
  opened:    'bg-sky-500/15 text-sky-300',
  completed: 'bg-emerald-500/15 text-emerald-300',
  clicked:   'bg-indigo-500/15 text-indigo-300',
}

export function isAssetType(v: string | null | undefined): v is AssetType {
  return ASSET_TYPES.includes(v as AssetType)
}

export function isAssetEventType(v: string | null | undefined): v is AssetEventType {
  return ASSET_EVENT_TYPES.includes(v as AssetEventType)
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
}
