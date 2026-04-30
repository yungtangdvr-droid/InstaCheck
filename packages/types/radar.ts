// ============================================================
// Creator Hub — Meme Radar types
// ============================================================
// Shared TypeScript types for the Meme Radar MVP. Mirrors the
// schema in supabase/migrations/0011_meme_radar.sql.
//
// PR 1 ships these definitions ahead of any consumer so that the
// future ingest CLI (PR 2), scoring CLI (PR 3) and feed UI (PR 4)
// share a single source of truth. The generated `supabase.ts` is
// not regenerated in PR 1; consumers can rely on the hand-written
// shapes below until PR 2 runs `pnpm db:types`.

// String unions mirror the new Postgres enums. Source of truth:
// supabase/migrations/0011_meme_radar.sql.
export type RadarItemDecision = 'new' | 'saved' | 'ignored'
export type RadarScoreStatus  = 'pending' | 'completed' | 'failed' | 'skipped'

// Closed sets used by the Gemini scoring schema (added in PR 3).
// Defined here so future code (UI chips, score-batch validators)
// imports a single source. Not enforced at the DB level — the
// columns are plain `text` and validated in code.
export type RadarControversyLevel = 'low' | 'medium' | 'high' | 'unknown'
export type RadarMisinfoRiskLevel = 'low' | 'medium' | 'high' | 'unknown'

// Per-row entities — flat camelCase projections of the DB rows.
// Naming follows Brand / ContentRecommendation / AutomationRun.

export interface RadarSource {
  id:          string
  url:         string
  label:       string
  language:    string | null
  active:      boolean
  lastFetchAt: string | null
  lastError:   string | null
  createdAt:   string
}

export interface RadarItem {
  id:          string
  rawItemId:   string
  sourceId:    string
  title:       string
  url:         string
  summary:     string | null
  publishedAt: string | null
  fingerprint: string
  decision:    RadarItemDecision
  decisionAt:  string | null
  createdAt:   string
}

// One angle returned by the model. Stored inside meme_angles jsonb
// as an array of length 3 in PR 3.
export interface RadarMemeAngle {
  angle: string
}

export interface RadarItemScore {
  id:                 string
  radarItemId:        string
  provider:           string
  model:              string
  promptVersion:      string
  status:             RadarScoreStatus

  memePotential:      number | null
  yugnatFit:          number | null
  timingUrgency:      number | null
  visualPotential:    number | null
  culturalRelevance:  number | null
  composite:          number | null

  whyMemable:         string | null
  memeAngles:         RadarMemeAngle[] | null
  recommendedFormat:  string | null
  culturalReferences: string[]
  primaryTheme:       string | null
  timingWindowHours:  number | null

  sensitivityContext: string[]
  controversyLevel:   RadarControversyLevel | null
  misinfoRisk:        RadarMisinfoRiskLevel | null
  legalCaution:       string | null
  tragedyContext:     string | null

  confidence:         number | null
  shortReason:        string | null
  inputTokens:        number | null
  outputTokens:       number | null
  errorMessage:       string | null
  scoredAt:           string | null
  createdAt:          string
  updatedAt:          string
}
