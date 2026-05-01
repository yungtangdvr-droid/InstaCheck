// Meme Radar — Supabase persistence helpers.
//
// Narrow typed boundary for the radar tables. The generated
// `packages/types/supabase.ts` was not regenerated when migration 0011
// added `radar_sources`, `raw_radar_items` and `radar_items`. Until the
// repo workflow `pnpm db:types` can run cleanly (requires Supabase CLI +
// local stack), we mirror the migration's row/insert shapes here and
// cast the Supabase client to a locally-augmented Database type at this
// single boundary. All consumers (CLI, ingest helpers) receive fully
// typed return values.
//
// Scope of the cast:
//   - radar_sources
//   - raw_radar_items
//   - radar_items
// `automation_runs` and every other table stay on the generated types.
//
// TODO(types): remove `DatabaseWithRadar` and `asRadarClient` when
// `packages/types/supabase.ts` is regenerated to include the radar
// tables.

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@creator-hub/types/supabase'
import type { RadarItemDecision, RadarScoreStatus } from '@creator-hub/types'

import { fingerprint } from './dedup'
import type { ParsedRadarItem } from './fetch-rss'

// ----- Local row / insert shapes (mirror 0011_meme_radar.sql) -----
// `type` aliases (not `interface`) — supabase-js's `GenericTable` requires
// each `Row`/`Insert`/`Update` to extend `Record<string, unknown>`, which
// type aliases satisfy structurally and interfaces do not.

export type RadarSourceRow = {
  id:            string
  url:           string
  label:         string
  language:      string | null
  active:        boolean
  last_fetch_at: string | null
  last_error:    string | null
  created_at:    string
}

type RadarSourceInsert = {
  id?:            string
  url:            string
  label:          string
  language?:      string | null
  active?:        boolean
  last_fetch_at?: string | null
  last_error?:    string | null
}

type RawRadarItemRow = {
  id:           string
  source_id:    string
  external_id:  string
  title:        string
  url:          string
  summary:      string | null
  published_at: string | null
  image_url:    string | null
  raw_json:     Json | null
  fetched_at:   string
}

type RawRadarItemInsert = {
  id?:           string
  source_id:     string
  external_id:   string
  title:         string
  url:           string
  summary?:      string | null
  published_at?: string | null
  image_url?:    string | null
  raw_json?:     Json | null
}

type RadarItemRow = {
  id:           string
  raw_item_id:  string
  source_id:    string
  title:        string
  url:          string
  summary:      string | null
  published_at: string | null
  image_url:    string | null
  fingerprint:  string
  decision:     RadarItemDecision
  decision_at:  string | null
  created_at:   string
}

type RadarItemInsert = {
  id?:           string
  raw_item_id:   string
  source_id:     string
  title:         string
  url:           string
  summary?:      string | null
  published_at?: string | null
  image_url?:    string | null
  fingerprint:   string
  decision?:     RadarItemDecision
  decision_at?:  string | null
}

export type RadarItemScoreRow = {
  id:                  string
  radar_item_id:       string
  provider:            string
  model:               string
  prompt_version:      string
  status:              RadarScoreStatus
  meme_potential:      number | null
  yugnat_fit:          number | null
  timing_urgency:      number | null
  visual_potential:    number | null
  cultural_relevance:  number | null
  composite:           number | null
  why_memable:         string | null
  meme_angles:         Json | null
  recommended_format:  string | null
  cultural_references: string[]
  primary_theme:       string | null
  timing_window_hours: number | null
  sensitivity_context: string[]
  controversy_level:   string | null
  misinformation_risk: string | null
  legal_caution:       string | null
  tragedy_context:     string | null
  confidence:          number | null
  short_reason:        string | null
  analysis_json:       Json | null
  input_tokens:        number | null
  output_tokens:       number | null
  error_message:       string | null
  scored_at:           string | null
  created_at:          string
  updated_at:          string
}

export type RadarItemScoreInsert = {
  id?:                  string
  radar_item_id:        string
  provider:             string
  model:                string
  prompt_version:       string
  status:               RadarScoreStatus
  meme_potential?:      number | null
  yugnat_fit?:          number | null
  timing_urgency?:      number | null
  visual_potential?:    number | null
  cultural_relevance?:  number | null
  composite?:           number | null
  why_memable?:         string | null
  meme_angles?:         Json | null
  recommended_format?:  string | null
  cultural_references?: string[]
  primary_theme?:       string | null
  timing_window_hours?: number | null
  sensitivity_context?: string[]
  controversy_level?:   string | null
  misinformation_risk?: string | null
  legal_caution?:       string | null
  tragedy_context?:     string | null
  confidence?:          number | null
  short_reason?:        string | null
  analysis_json?:       Json | null
  input_tokens?:        number | null
  output_tokens?:       number | null
  error_message?:       string | null
  scored_at?:           string | null
}

type RadarTables = {
  radar_sources: {
    Row:    RadarSourceRow
    Insert: RadarSourceInsert
    Update: Partial<RadarSourceInsert>
    Relationships: []
  }
  raw_radar_items: {
    Row:    RawRadarItemRow
    Insert: RawRadarItemInsert
    Update: Partial<RawRadarItemInsert>
    Relationships: []
  }
  radar_items: {
    Row:    RadarItemRow
    Insert: RadarItemInsert
    Update: Partial<RadarItemInsert>
    Relationships: []
  }
  radar_item_scores: {
    Row:    RadarItemScoreRow
    Insert: RadarItemScoreInsert
    Update: Partial<RadarItemScoreInsert>
    Relationships: []
  }
}

type DatabaseWithRadar = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables'> & {
    Tables: Database['public']['Tables'] & RadarTables
  }
}

// One narrow cast confined to this module. The shape of
// `DatabaseWithRadar` is fully defined above and matches the migration.
export function asRadarClient(
  supabase: SupabaseClient<Database>,
): SupabaseClient<DatabaseWithRadar> {
  return supabase as unknown as SupabaseClient<DatabaseWithRadar>
}

// ----- Read helpers -----

export async function listActiveSources(
  supabase: SupabaseClient<Database>,
  filterUrl?: string,
): Promise<RadarSourceRow[]> {
  const client = asRadarClient(supabase)
  let query = client
    .from('radar_sources')
    .select('id,url,label,language,active,last_fetch_at,last_error,created_at')
    .eq('active', true)
    .order('created_at', { ascending: true })
  if (filterUrl) query = query.eq('url', filterUrl)
  const { data, error } = await query
  if (error) throw new Error(`list_active_sources_failed: ${error.message}`)
  return data ?? []
}

// ----- Seed helper -----

export async function upsertSource(
  supabase: SupabaseClient<Database>,
  input: { url: string; label: string; language: string | null },
): Promise<{ inserted: boolean }> {
  const client = asRadarClient(supabase)
  const { data: existing, error: selErr } = await client
    .from('radar_sources')
    .select('id')
    .eq('url', input.url)
    .maybeSingle()
  if (selErr) throw new Error(`upsert_source_select_failed: ${selErr.message}`)

  if (existing) {
    const { error: updErr } = await client
      .from('radar_sources')
      .update({ label: input.label, language: input.language })
      .eq('id', existing.id)
    if (updErr) throw new Error(`upsert_source_update_failed: ${updErr.message}`)
    return { inserted: false }
  }

  const { error: insErr } = await client
    .from('radar_sources')
    .insert({
      url:      input.url,
      label:    input.label,
      language: input.language,
      active:   true,
    })
  if (insErr) throw new Error(`upsert_source_insert_failed: ${insErr.message}`)
  return { inserted: true }
}

// ----- Source status updates -----

export async function markSourceFetched(
  supabase: SupabaseClient<Database>,
  sourceId: string,
  ok: boolean,
  errorMessage: string | null,
): Promise<void> {
  const client = asRadarClient(supabase)
  const { error } = await client
    .from('radar_sources')
    .update({
      last_fetch_at: new Date().toISOString(),
      last_error:    ok ? null : (errorMessage ?? 'unknown_error'),
    })
    .eq('id', sourceId)
  if (error) throw new Error(`mark_source_fetched_failed: ${error.message}`)
}

// ----- Per-item ingest -----

export interface IngestItemResult {
  rawInserted:  boolean
  itemInserted: boolean
}

// Idempotent two-step write: raw row first (unique on source_id +
// external_id), then a deduped radar_items row (unique on fingerprint).
// When a duplicate already exists at either step, the corresponding
// `*Inserted` flag is false and we keep going.
export async function ingestItem(
  supabase: SupabaseClient<Database>,
  sourceId: string,
  parsed:   ParsedRadarItem,
): Promise<IngestItemResult> {
  const client = asRadarClient(supabase)

  // Step 1: raw_radar_items
  const { data: rawIns, error: rawErr } = await client
    .from('raw_radar_items')
    .insert({
      source_id:    sourceId,
      external_id:  parsed.externalId,
      title:        parsed.title,
      url:          parsed.url,
      summary:      parsed.summary,
      published_at: parsed.publishedAt,
      image_url:    parsed.imageUrl,
      raw_json:     parsed.rawJson as Json,
    })
    .select('id')
    .maybeSingle()

  let rawId: string | null = rawIns?.id ?? null
  let rawInserted = rawIns != null

  if (rawErr) {
    // Unique violation on (source_id, external_id) → already ingested.
    // Look up the existing row id so we can still try the radar_items step.
    if (rawErr.code === '23505') {
      const { data: existing, error: lookupErr } = await client
        .from('raw_radar_items')
        .select('id')
        .eq('source_id',   sourceId)
        .eq('external_id', parsed.externalId)
        .maybeSingle()
      if (lookupErr) throw new Error(`raw_lookup_failed: ${lookupErr.message}`)
      rawId = existing?.id ?? null
      rawInserted = false
    } else {
      throw new Error(`raw_insert_failed: ${rawErr.message}`)
    }
  }

  if (!rawId) {
    return { rawInserted: false, itemInserted: false }
  }

  // Step 2: radar_items (deduped by fingerprint).
  const fp = fingerprint(parsed.title, parsed.url)
  const { error: itemErr } = await client
    .from('radar_items')
    .insert({
      raw_item_id:  rawId,
      source_id:    sourceId,
      title:        parsed.title,
      url:          parsed.url,
      summary:      parsed.summary,
      published_at: parsed.publishedAt,
      image_url:    parsed.imageUrl,
      fingerprint:  fp,
      decision:     'new',
    })

  if (itemErr) {
    if (itemErr.code === '23505') {
      // Duplicate fingerprint — another raw item from the same outlet
      // already produced this canonical radar_item.
      return { rawInserted, itemInserted: false }
    }
    throw new Error(`item_insert_failed: ${itemErr.message}`)
  }
  return { rawInserted, itemInserted: true }
}

// ----- Scoring candidate selection / persistence -----

export type RadarScoreCandidate = {
  id:           string
  title:        string
  url:          string
  summary:      string | null
  published_at: string | null
  created_at:   string
  source_id:    string
}

// Joins the source label/url so the scoring prompt has `source_label`
// + `source_domain` without a second per-row round-trip.
export type RadarScoreCandidateWithSource = RadarScoreCandidate & {
  source_label: string
  source_url:   string
}

// Pulls radar_items in the [since, now] window, ordered for
// deterministic paging (published_at desc NULLS last → created_at desc → id asc).
export async function fetchRadarCandidates(
  supabase: SupabaseClient<Database>,
  args: { since: string; limit: number },
): Promise<RadarScoreCandidate[]> {
  const client = asRadarClient(supabase)
  const { data, error } = await client
    .from('radar_items')
    .select('id,title,url,summary,published_at,created_at,source_id')
    .gte('published_at', args.since)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at',   { ascending: false })
    .order('id',           { ascending: true })
    .limit(args.limit)
  if (error) throw new Error(`radar_candidates_query_failed: ${error.message}`)
  return data ?? []
}

// Lookup of existing score rows for the candidate set, keyed by
// `radar_item_id`. Used both for eligibility filtering and for
// detecting whether we need to upsert vs insert.
export async function fetchExistingScores(
  supabase: SupabaseClient<Database>,
  itemIds:  string[],
): Promise<Map<string, { radar_item_id: string; status: RadarScoreStatus; prompt_version: string }>> {
  if (itemIds.length === 0) return new Map()
  const client = asRadarClient(supabase)
  const { data, error } = await client
    .from('radar_item_scores')
    .select('radar_item_id,status,prompt_version')
    .in('radar_item_id', itemIds)
  if (error) throw new Error(`radar_existing_scores_query_failed: ${error.message}`)
  const out = new Map<string, { radar_item_id: string; status: RadarScoreStatus; prompt_version: string }>()
  for (const row of data ?? []) {
    out.set(row.radar_item_id, {
      radar_item_id:  row.radar_item_id,
      status:         row.status,
      prompt_version: row.prompt_version,
    })
  }
  return out
}

export async function fetchSourcesByIds(
  supabase: SupabaseClient<Database>,
  ids:      string[],
): Promise<Map<string, RadarSourceRow>> {
  if (ids.length === 0) return new Map()
  const client = asRadarClient(supabase)
  const { data, error } = await client
    .from('radar_sources')
    .select('id,url,label,language,active,last_fetch_at,last_error,created_at')
    .in('id', ids)
  if (error) throw new Error(`radar_sources_lookup_failed: ${error.message}`)
  return new Map((data ?? []).map((s) => [s.id, s]))
}

export async function upsertRadarScore(
  supabase: SupabaseClient<Database>,
  insert:   RadarItemScoreInsert,
): Promise<void> {
  const client = asRadarClient(supabase)
  const { error } = await client
    .from('radar_item_scores')
    .upsert(insert, { onConflict: 'radar_item_id' })
  if (error) throw new Error(`radar_score_upsert_failed: ${error.message}`)
}

// ----- automation_runs -----

const RADAR_INGEST_AUTOMATION = 'meme-radar-rss-ingest'
export const RADAR_SCORE_AUTOMATION = 'meme-radar-score'

export async function logAutomationRun(
  supabase:       SupabaseClient<Database>,
  status:         'success' | 'failed' | 'skipped',
  summary:        Record<string, unknown>,
  automationName: string = RADAR_INGEST_AUTOMATION,
): Promise<void> {
  const { error } = await supabase.from('automation_runs').insert({
    automation_name: automationName,
    status,
    result_summary:  JSON.stringify(summary),
  })
  if (error) {
    // Non-fatal; surface to caller via thrown error so the CLI can log.
    throw new Error(`automation_run_insert_failed: ${error.message}`)
  }
}
