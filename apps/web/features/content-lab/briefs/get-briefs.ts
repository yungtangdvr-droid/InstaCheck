import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type {
  MemeBrief,
  MemeBriefFitBand,
  MemeBriefLanguage,
  MemeBriefStatus,
} from '@creator-hub/types'

import {
  getBriefById,
  listBriefs,
  type MemeBriefRow,
} from '@/lib/briefs/persist'

const FIT_BAND_VALUES: MemeBriefFitBand[] = ['strong', 'moderate', 'weak', 'off_brand', 'unknown']
const LANGUAGE_VALUES: MemeBriefLanguage[] = ['fr', 'en', 'mix', 'unknown']

function toFitBand(value: string | null): MemeBriefFitBand | null {
  if (!value) return null
  return (FIT_BAND_VALUES as string[]).includes(value)
    ? (value as MemeBriefFitBand)
    : null
}

function toLanguage(value: string | null): MemeBriefLanguage | null {
  if (!value) return null
  return (LANGUAGE_VALUES as string[]).includes(value)
    ? (value as MemeBriefLanguage)
    : null
}

export function rowToMemeBrief(row: MemeBriefRow): MemeBrief {
  return {
    id:                      row.id,
    sourceRadarItemId:       row.source_radar_item_id,
    extraRadarItemIds:       row.extra_radar_item_ids ?? [],

    signalTitle:             row.signal_title,
    signalUrl:               row.signal_url,
    signalImageUrl:          row.signal_image_url,
    signalSummary:           row.signal_summary,
    sourceLabel:             row.source_label,
    sourceLanguage:          row.source_language,

    culturalTension:         row.cultural_tension,
    underlyingFeeling:       row.underlying_feeling,
    contradiction:           row.contradiction,
    memeCompression:         row.meme_compression,
    visualDirection:         row.visual_direction,
    captionSeed:             row.caption_seed,
    whyItIsMemeable:         row.why_it_is_memeable,

    yugnatFit:               row.yugnat_fit,
    yugnatFitBand:           toFitBand(row.yugnat_fit_band),
    riskOrTimingCaveat:      row.risk_or_timing_caveat,
    suggestedLanguage:       toLanguage(row.suggested_language),
    freshnessHalfLifeHours:  row.freshness_half_life_hours,

    status:                  row.status,
    statusAt:                row.status_at,

    provider:                row.provider,
    model:                   row.model,
    promptVersion:           row.prompt_version,
    inputTokens:             row.input_tokens,
    outputTokens:            row.output_tokens,
    errorMessage:            row.error_message,

    generatedAt:             row.generated_at,
    createdAt:               row.created_at,
    updatedAt:               row.updated_at,
  }
}

export async function getBriefs(
  supabase: SupabaseClient<Database>,
  status?:  MemeBriefStatus | 'all',
): Promise<MemeBrief[]> {
  const rows = await listBriefs(supabase, status)
  return rows.map(rowToMemeBrief)
}

export async function getBrief(
  supabase: SupabaseClient<Database>,
  id:       string,
): Promise<MemeBrief | null> {
  const row = await getBriefById(supabase, id)
  if (!row) return null
  return rowToMemeBrief(row)
}

export interface BriefTabCounts {
  draft:     number
  kept:      number
  discarded: number
  shipped:   number
  all:       number
}

export async function getBriefCounts(
  supabase: SupabaseClient<Database>,
): Promise<BriefTabCounts> {
  const rows = await listBriefs(supabase, 'all')
  const counts: BriefTabCounts = { draft: 0, kept: 0, discarded: 0, shipped: 0, all: 0 }
  for (const r of rows) {
    counts.all += 1
    counts[r.status] += 1
  }
  return counts
}
