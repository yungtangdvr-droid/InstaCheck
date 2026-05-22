// ============================================================
// Creator Hub — Meme Briefs types
// ============================================================
// Shared TypeScript types for the Meme Briefs (Zeitgeist) layer.
// Mirrors the schema in supabase/migrations/0023_meme_briefs.sql.

export type MemeBriefStatus = 'draft' | 'kept' | 'discarded' | 'shipped'

export type MemeBriefFitBand = 'strong' | 'moderate' | 'weak' | 'off_brand' | 'unknown'

export type MemeBriefLanguage = 'fr' | 'en' | 'mix' | 'unknown'

export interface MemeBrief {
  id:                       string
  sourceRadarItemId:        string | null
  extraRadarItemIds:        string[]

  signalTitle:              string | null
  signalUrl:                string | null
  signalImageUrl:           string | null
  signalSummary:            string | null
  sourceLabel:              string | null
  sourceLanguage:           string | null

  culturalTension:          string | null
  underlyingFeeling:        string | null
  contradiction:            string | null
  memeCompression:          string | null
  visualDirection:          string | null
  captionSeed:              string | null
  whyItIsMemeable:          string | null

  yugnatFit:                number | null
  yugnatFitBand:            MemeBriefFitBand | null
  riskOrTimingCaveat:       string | null
  suggestedLanguage:        MemeBriefLanguage | null
  freshnessHalfLifeHours:   number | null

  status:                   MemeBriefStatus
  statusAt:                 string | null

  provider:                 string
  model:                    string
  promptVersion:            string
  inputTokens:              number | null
  outputTokens:             number | null
  errorMessage:             string | null

  generatedAt:              string | null
  createdAt:                string
  updatedAt:                string
}
