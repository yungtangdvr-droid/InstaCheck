// Meme Brief — structured-output schema (Zod + Gemini + OpenAI).
//
// Same triple-view pattern as `lib/gemini/radar-schema.ts`:
//   - Zod (`BriefAnalysisSchema`) — runtime validator + inferred type
//   - Gemini (`GEMINI_BRIEF_RESPONSE_SCHEMA`) — `responseSchema`
//   - OpenAI (`OPENAI_BRIEF_JSON_SCHEMA`) — strict Structured Outputs
//
// v1.2: `observable_behavior` and `why_it_might_fail` are top-level
// fields. `meme_grammar` is the memetic-object diagnosis
// (content/form/stance/template_type/implied_viewer/remixability/
// why_now). All new fields land in `analysis_json` — no DB migration.

import { Type } from '@google/genai'
import { z } from 'zod'

export const BRIEF_FIT_BAND_VALUES = [
  'strong',
  'moderate',
  'weak',
  'off_brand',
  'unknown',
] as const

export const BRIEF_LANGUAGE_VALUES = ['fr', 'en', 'mix', 'unknown'] as const

const enumWithUnknown = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' && (values as readonly string[]).includes(v) ? v : 'unknown'),
    z.enum(values),
  )

const intScore = z.preprocess(
  (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      return Math.round(Math.max(0, Math.min(100, v)))
    }
    if (typeof v === 'string') {
      const n = Number.parseFloat(v)
      if (Number.isFinite(n)) return Math.round(Math.max(0, Math.min(100, n)))
    }
    return v
  },
  z.number().int().min(0).max(100),
)

const intHours = z.preprocess(
  (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      return Math.round(Math.max(1, Math.min(720, v)))
    }
    if (typeof v === 'string') {
      const n = Number.parseFloat(v)
      if (Number.isFinite(n)) return Math.round(Math.max(1, Math.min(720, n)))
    }
    return v
  },
  z.number().int().min(1).max(720),
)

// v1.2: memetic-object diagnosis. Lives in `analysis_json` — no DB
// column per-subfield. Observable behavior + failure mode moved out to
// top-level (load-bearing in the quality guard).
export const MemeGrammarSchema = z.object({
  content:        z.string().min(1).max(200),
  form:           z.string().min(1).max(160),
  stance:         z.string().min(1).max(120),
  template_type:  z.string().min(1).max(120),
  implied_viewer: z.string().min(1).max(160),
  remixability:   z.string().min(1).max(200),
  why_now:        z.string().min(1).max(200),
})

export const BriefAnalysisSchema = z.object({
  cultural_tension:          z.string().min(1).max(240),
  underlying_feeling:        z.string().min(1).max(200),
  contradiction:             z.string().min(1).max(220),
  observable_behavior:       z.string().min(1).max(240),
  meme_compression:          z.string().min(1).max(160),
  visual_direction:          z.string().min(1).max(400),
  caption_seed:              z.string().min(1).max(160),
  meme_grammar:              MemeGrammarSchema,
  why_it_is_memeable:        z.string().min(1).max(280),
  why_it_might_fail:         z.string().min(1).max(280),
  yugnat_fit:                intScore,
  yugnat_fit_band:           enumWithUnknown(BRIEF_FIT_BAND_VALUES),
  risk_or_timing_caveat:     z.string().max(280).default(''),
  suggested_language:        enumWithUnknown(BRIEF_LANGUAGE_VALUES),
  freshness_half_life_hours: intHours,
})

export type BriefAnalysis = z.infer<typeof BriefAnalysisSchema>

// ----- Gemini structured-output schema -----

const GEMINI_MEME_GRAMMAR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    content:        { type: Type.STRING },
    form:           { type: Type.STRING },
    stance:         { type: Type.STRING },
    template_type:  { type: Type.STRING },
    implied_viewer: { type: Type.STRING },
    remixability:   { type: Type.STRING },
    why_now:        { type: Type.STRING },
  },
  required: [
    'content',
    'form',
    'stance',
    'template_type',
    'implied_viewer',
    'remixability',
    'why_now',
  ],
  propertyOrdering: [
    'content',
    'form',
    'stance',
    'template_type',
    'implied_viewer',
    'remixability',
    'why_now',
  ],
}

export const GEMINI_BRIEF_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    cultural_tension:          { type: Type.STRING },
    underlying_feeling:        { type: Type.STRING },
    contradiction:             { type: Type.STRING },
    observable_behavior:       { type: Type.STRING },
    meme_compression:          { type: Type.STRING },
    visual_direction:          { type: Type.STRING },
    caption_seed:              { type: Type.STRING },
    meme_grammar:              GEMINI_MEME_GRAMMAR_SCHEMA,
    why_it_is_memeable:        { type: Type.STRING },
    why_it_might_fail:         { type: Type.STRING },
    yugnat_fit:                { type: Type.INTEGER },
    yugnat_fit_band:           { type: Type.STRING, enum: [...BRIEF_FIT_BAND_VALUES] },
    risk_or_timing_caveat:     { type: Type.STRING },
    suggested_language:        { type: Type.STRING, enum: [...BRIEF_LANGUAGE_VALUES] },
    freshness_half_life_hours: { type: Type.INTEGER },
  },
  required: [
    'cultural_tension',
    'underlying_feeling',
    'contradiction',
    'observable_behavior',
    'meme_compression',
    'visual_direction',
    'caption_seed',
    'meme_grammar',
    'why_it_is_memeable',
    'why_it_might_fail',
    'yugnat_fit',
    'yugnat_fit_band',
    'risk_or_timing_caveat',
    'suggested_language',
    'freshness_half_life_hours',
  ],
  propertyOrdering: [
    'cultural_tension',
    'underlying_feeling',
    'contradiction',
    'observable_behavior',
    'meme_compression',
    'visual_direction',
    'caption_seed',
    'meme_grammar',
    'why_it_is_memeable',
    'why_it_might_fail',
    'yugnat_fit',
    'yugnat_fit_band',
    'risk_or_timing_caveat',
    'suggested_language',
    'freshness_half_life_hours',
  ],
}

// ----- OpenAI strict Structured Outputs schema -----

const OPENAI_MEME_GRAMMAR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    content:        { type: 'string' },
    form:           { type: 'string' },
    stance:         { type: 'string' },
    template_type:  { type: 'string' },
    implied_viewer: { type: 'string' },
    remixability:   { type: 'string' },
    why_now:        { type: 'string' },
  },
  required: [
    'content',
    'form',
    'stance',
    'template_type',
    'implied_viewer',
    'remixability',
    'why_now',
  ],
} as const

export const OPENAI_BRIEF_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cultural_tension:          { type: 'string'  },
    underlying_feeling:        { type: 'string'  },
    contradiction:             { type: 'string'  },
    observable_behavior:       { type: 'string'  },
    meme_compression:          { type: 'string'  },
    visual_direction:          { type: 'string'  },
    caption_seed:              { type: 'string'  },
    meme_grammar:              OPENAI_MEME_GRAMMAR_SCHEMA,
    why_it_is_memeable:        { type: 'string'  },
    why_it_might_fail:         { type: 'string'  },
    yugnat_fit:                { type: 'integer' },
    yugnat_fit_band:           { type: 'string',  enum: [...BRIEF_FIT_BAND_VALUES] },
    risk_or_timing_caveat:     { type: 'string'  },
    suggested_language:        { type: 'string',  enum: [...BRIEF_LANGUAGE_VALUES] },
    freshness_half_life_hours: { type: 'integer' },
  },
  required: [
    'cultural_tension',
    'underlying_feeling',
    'contradiction',
    'observable_behavior',
    'meme_compression',
    'visual_direction',
    'caption_seed',
    'meme_grammar',
    'why_it_is_memeable',
    'why_it_might_fail',
    'yugnat_fit',
    'yugnat_fit_band',
    'risk_or_timing_caveat',
    'suggested_language',
    'freshness_half_life_hours',
  ],
} as const
