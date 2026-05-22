// Meme Brief — structured-output schema (Zod + Gemini + OpenAI).
//
// Same triple-view pattern as `lib/gemini/radar-schema.ts`:
//   - Zod (`BriefAnalysisSchema`) — runtime validator + inferred type
//   - Gemini (`GEMINI_BRIEF_RESPONSE_SCHEMA`) — `responseSchema`
//   - OpenAI (`OPENAI_BRIEF_JSON_SCHEMA`) — strict Structured Outputs

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

export const BriefAnalysisSchema = z.object({
  cultural_tension:          z.string().min(1).max(200),
  underlying_feeling:        z.string().min(1).max(160),
  contradiction:             z.string().min(1).max(180),
  meme_compression:          z.string().min(1).max(140),
  visual_direction:          z.string().min(1).max(320),
  caption_seed:              z.string().min(1).max(140),
  why_it_is_memeable:        z.string().min(1).max(240),
  yugnat_fit:                intScore,
  yugnat_fit_band:           enumWithUnknown(BRIEF_FIT_BAND_VALUES),
  risk_or_timing_caveat:     z.string().max(240).default(''),
  suggested_language:        enumWithUnknown(BRIEF_LANGUAGE_VALUES),
  freshness_half_life_hours: intHours,
})

export type BriefAnalysis = z.infer<typeof BriefAnalysisSchema>

// ----- Gemini structured-output schema -----

export const GEMINI_BRIEF_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    cultural_tension:          { type: Type.STRING },
    underlying_feeling:        { type: Type.STRING },
    contradiction:             { type: Type.STRING },
    meme_compression:          { type: Type.STRING },
    visual_direction:          { type: Type.STRING },
    caption_seed:              { type: Type.STRING },
    why_it_is_memeable:        { type: Type.STRING },
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
    'meme_compression',
    'visual_direction',
    'caption_seed',
    'why_it_is_memeable',
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
    'meme_compression',
    'visual_direction',
    'caption_seed',
    'why_it_is_memeable',
    'yugnat_fit',
    'yugnat_fit_band',
    'risk_or_timing_caveat',
    'suggested_language',
    'freshness_half_life_hours',
  ],
}

// ----- OpenAI strict Structured Outputs schema -----

export const OPENAI_BRIEF_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cultural_tension:          { type: 'string'  },
    underlying_feeling:        { type: 'string'  },
    contradiction:             { type: 'string'  },
    meme_compression:          { type: 'string'  },
    visual_direction:          { type: 'string'  },
    caption_seed:              { type: 'string'  },
    why_it_is_memeable:        { type: 'string'  },
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
    'meme_compression',
    'visual_direction',
    'caption_seed',
    'why_it_is_memeable',
    'yugnat_fit',
    'yugnat_fit_band',
    'risk_or_timing_caveat',
    'suggested_language',
    'freshness_half_life_hours',
  ],
} as const
