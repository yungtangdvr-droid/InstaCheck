// Meme Briefs — Supabase persistence helpers.
//
// Narrow typed boundary for the `meme_briefs` table (mirrors the
// `asRadarClient` pattern in `lib/radar/persist.ts`). The generated
// supabase types do not yet include this table; we declare the row /
// insert shapes here and cast at this single boundary.

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@creator-hub/types/supabase'
import type { MemeBriefStatus } from '@creator-hub/types'

// ----- Local row / insert shapes (mirror 0023_meme_briefs.sql) -----

export type MemeBriefRow = {
  id:                        string
  source_radar_item_id:      string | null
  extra_radar_item_ids:      string[]

  signal_title:              string | null
  signal_url:                string | null
  signal_image_url:          string | null
  signal_summary:            string | null
  source_label:              string | null
  source_language:           string | null

  cultural_tension:          string | null
  underlying_feeling:        string | null
  contradiction:             string | null
  meme_compression:          string | null
  visual_direction:          string | null
  caption_seed:              string | null
  why_it_is_memeable:        string | null

  yugnat_fit:                number | null
  yugnat_fit_band:           string | null
  risk_or_timing_caveat:     string | null
  suggested_language:        string | null
  freshness_half_life_hours: number | null

  status:                    MemeBriefStatus
  status_at:                 string | null

  provider:                  string
  model:                     string
  prompt_version:            string
  input_tokens:              number | null
  output_tokens:             number | null
  error_message:             string | null
  analysis_json:             Json | null

  generated_at:              string | null
  created_at:                string
  updated_at:                string
}

export type MemeBriefInsert = {
  id?:                        string
  source_radar_item_id?:      string | null
  extra_radar_item_ids?:      string[]

  signal_title?:              string | null
  signal_url?:                string | null
  signal_image_url?:          string | null
  signal_summary?:            string | null
  source_label?:              string | null
  source_language?:           string | null

  cultural_tension?:          string | null
  underlying_feeling?:        string | null
  contradiction?:             string | null
  meme_compression?:          string | null
  visual_direction?:          string | null
  caption_seed?:              string | null
  why_it_is_memeable?:        string | null

  yugnat_fit?:                number | null
  yugnat_fit_band?:           string | null
  risk_or_timing_caveat?:     string | null
  suggested_language?:        string | null
  freshness_half_life_hours?: number | null

  status?:                    MemeBriefStatus
  status_at?:                 string | null

  provider:                   string
  model:                      string
  prompt_version:             string
  input_tokens?:              number | null
  output_tokens?:             number | null
  error_message?:             string | null
  analysis_json?:             Json | null

  generated_at?:              string | null
}

type BriefsTables = {
  meme_briefs: {
    Row:           MemeBriefRow
    Insert:        MemeBriefInsert
    Update:        Partial<MemeBriefInsert>
    Relationships: []
  }
}

type DatabaseWithBriefs = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables'> & {
    Tables: Database['public']['Tables'] & BriefsTables
  }
}

export function asBriefsClient(
  supabase: SupabaseClient<Database>,
): SupabaseClient<DatabaseWithBriefs> {
  return supabase as unknown as SupabaseClient<DatabaseWithBriefs>
}

// ----- Read helpers -----

export const BRIEFS_AUTOMATION = 'meme-briefs-generate'

// Lookup map keyed by source_radar_item_id → most recent non-discarded
// brief. Used by:
//   - candidate selection (skip recently generated radar items)
//   - radar card integration (show "View brief" vs "Generate brief")
export async function fetchActiveBriefsBySourceIds(
  supabase: SupabaseClient<Database>,
  sourceIds: string[],
  withinHoursForDuplicate: number | null = null,
): Promise<Map<string, MemeBriefRow>> {
  if (sourceIds.length === 0) return new Map()
  const client = asBriefsClient(supabase)
  let query = client
    .from('meme_briefs')
    .select('*')
    .in('source_radar_item_id', sourceIds)
    .neq('status', 'discarded')
    .order('created_at', { ascending: false })
  if (withinHoursForDuplicate !== null) {
    const sinceIso = new Date(
      Date.now() - withinHoursForDuplicate * 3_600_000,
    ).toISOString()
    query = query.gte('created_at', sinceIso)
  }
  const { data, error } = await query
  if (error) throw new Error(`meme_briefs_lookup_failed: ${error.message}`)
  const out = new Map<string, MemeBriefRow>()
  for (const row of data ?? []) {
    if (!row.source_radar_item_id) continue
    if (!out.has(row.source_radar_item_id)) {
      out.set(row.source_radar_item_id, row)
    }
  }
  return out
}

export async function listBriefs(
  supabase: SupabaseClient<Database>,
  status?: MemeBriefStatus | 'all',
): Promise<MemeBriefRow[]> {
  const client = asBriefsClient(supabase)
  let query = client
    .from('meme_briefs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (status && status !== 'all') query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(`meme_briefs_list_failed: ${error.message}`)
  return data ?? []
}

export async function getBriefById(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<MemeBriefRow | null> {
  const client = asBriefsClient(supabase)
  const { data, error } = await client
    .from('meme_briefs')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`meme_brief_get_failed: ${error.message}`)
  return data ?? null
}

export async function insertBrief(
  supabase: SupabaseClient<Database>,
  insert:   MemeBriefInsert,
): Promise<MemeBriefRow> {
  const client = asBriefsClient(supabase)
  const { data, error } = await client
    .from('meme_briefs')
    .insert(insert)
    .select('*')
    .single()
  if (error) throw new Error(`meme_brief_insert_failed: ${error.message}`)
  return data
}

export async function updateBriefStatus(
  supabase: SupabaseClient<Database>,
  id:       string,
  status:   MemeBriefStatus,
): Promise<void> {
  const client = asBriefsClient(supabase)
  const { error } = await client
    .from('meme_briefs')
    .update({ status, status_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`meme_brief_status_update_failed: ${error.message}`)
}
