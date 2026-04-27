// ============================================================
// Generated-types extension layer
// ============================================================
// `packages/types/supabase.ts` is produced by
// `pnpm supabase gen types typescript --local` and must NOT be
// hand-edited. Adding a new table requires running that command
// against a live local Supabase stack, which requires Docker.
//
// PR5 introduces `raw_instagram_audience_demographics` (migration
// 0009). When this PR was authored Docker was unavailable in the
// sandbox, so the generated file does not yet describe the table.
// This module re-exports a minimally-augmented `Database` type
// that adds the missing row/insert/update shapes so the new
// sync/feature code can typecheck against the same `from('table')`
// pattern as the rest of the codebase.
//
// After a reviewer with Docker re-runs `pnpm db:types`, the new
// table will appear in `supabase.ts` and this file becomes a
// no-op. Safe to delete at that point — every consumer can
// switch its import back to `@creator-hub/types/supabase`.

import type { Database as GeneratedDatabase, Json } from './supabase'

export type AudienceDemographicsRow = {
  id:              string
  account_id:      string
  date:            string
  timeframe:       string
  breakdown:       string
  key:             string
  label:           string | null
  value:           number
  threshold_state: string
  fetched_via:     string
  reason:          string | null
  raw_json:        Json
  synced_at:       string
}

export type AudienceDemographicsInsert = {
  id?:              string
  account_id:       string
  date:             string
  timeframe:        string
  breakdown:        string
  key:              string
  label?:           string | null
  value?:           number
  threshold_state:  string
  fetched_via?:     string
  reason?:          string | null
  raw_json?:        Json
  synced_at?:       string
}

export type AudienceDemographicsUpdate = {
  id?:              string
  account_id?:      string
  date?:            string
  timeframe?:       string
  breakdown?:       string
  key?:             string
  label?:           string | null
  value?:           number
  threshold_state?: string
  fetched_via?:     string
  reason?:          string | null
  raw_json?:        Json
  synced_at?:       string
}

export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedDatabase['public'], 'Tables'> & {
    Tables: GeneratedDatabase['public']['Tables'] & {
      raw_instagram_audience_demographics: {
        Row:           AudienceDemographicsRow
        Insert:        AudienceDemographicsInsert
        Update:        AudienceDemographicsUpdate
        Relationships: []
      }
    }
  }
}
