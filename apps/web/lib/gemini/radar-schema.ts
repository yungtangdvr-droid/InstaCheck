// Meme Radar — Gemini / OpenAI structured-output schema.
//
// Mirrors three views of the same shape:
//   - Zod (`RadarAnalysisSchema`) — runtime validator, source of the
//     inferred TS type the orchestrator passes to persistence.
//   - Gemini (`GEMINI_RADAR_RESPONSE_SCHEMA`) — sent to `responseSchema`
//     in the GoogleGenAI SDK call.
//   - OpenAI (`OPENAI_RADAR_JSON_SCHEMA`) — strict Structured Outputs
//     mirror used by the OpenAI fallback.
//
// Composite is NOT in the schema. The five sub-scores are; the
// composite is computed in TypeScript via `radarComposite`.

import { Type } from '@google/genai'
import { z } from 'zod'

import { FORMAT_PATTERNS, PRIMARY_THEMES } from './schema'

export const RADAR_LEVEL_VALUES = ['low', 'medium', 'high', 'unknown'] as const

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

// One angle per array entry. We accept both `{ angle: string }` and a
// plain string (model occasionally degrades to the simpler shape on
// retry); both normalize to the object form.
const memeAngleSchema = z.preprocess(
  (v) => {
    if (typeof v === 'string') return { angle: v }
    return v
  },
  z.object({ angle: z.string().min(1).max(180) }),
)

export const RadarAnalysisSchema = z.object({
  meme_potential:      intScore,
  yugnat_fit:          intScore,
  timing_urgency:      intScore,
  visual_potential:    intScore,
  cultural_relevance:  intScore,
  why_memable:         z.string().max(240).default(''),
  meme_angles:         z.array(memeAngleSchema).min(3).max(3),
  recommended_format:  enumWithUnknown(FORMAT_PATTERNS),
  cultural_references: z.array(z.string().min(1).max(120)).max(5).default([]),
  primary_theme:       enumWithUnknown(PRIMARY_THEMES),
  timing_window_hours: z.number().int().min(0).max(8760).default(168),
  sensitivity_context: z.array(z.string().min(1).max(80)).max(5).default([]),
  controversy_level:   enumWithUnknown(RADAR_LEVEL_VALUES),
  misinformation_risk: enumWithUnknown(RADAR_LEVEL_VALUES),
  legal_caution:       z.string().max(240).default(''),
  tragedy_context:     z.string().max(240).default(''),
  confidence:          z.number().min(0).max(1),
  short_reason:        z.string().max(240).default(''),
})

export type RadarAnalysis = z.infer<typeof RadarAnalysisSchema>

// ----- Gemini structured-output schema -----

export const GEMINI_RADAR_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    meme_potential:      { type: Type.INTEGER },
    yugnat_fit:          { type: Type.INTEGER },
    timing_urgency:      { type: Type.INTEGER },
    visual_potential:    { type: Type.INTEGER },
    cultural_relevance:  { type: Type.INTEGER },
    why_memable:         { type: Type.STRING },
    meme_angles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { angle: { type: Type.STRING } },
        required: ['angle'],
      },
    },
    recommended_format:  { type: Type.STRING, enum: [...FORMAT_PATTERNS] },
    cultural_references: { type: Type.ARRAY, items: { type: Type.STRING } },
    primary_theme:       { type: Type.STRING, enum: [...PRIMARY_THEMES] },
    timing_window_hours: { type: Type.INTEGER },
    sensitivity_context: { type: Type.ARRAY, items: { type: Type.STRING } },
    controversy_level:   { type: Type.STRING, enum: [...RADAR_LEVEL_VALUES] },
    misinformation_risk: { type: Type.STRING, enum: [...RADAR_LEVEL_VALUES] },
    legal_caution:       { type: Type.STRING },
    tragedy_context:     { type: Type.STRING },
    confidence:          { type: Type.NUMBER },
    short_reason:        { type: Type.STRING },
  },
  required: [
    'meme_potential',
    'yugnat_fit',
    'timing_urgency',
    'visual_potential',
    'cultural_relevance',
    'why_memable',
    'meme_angles',
    'recommended_format',
    'cultural_references',
    'primary_theme',
    'timing_window_hours',
    'sensitivity_context',
    'controversy_level',
    'misinformation_risk',
    'legal_caution',
    'tragedy_context',
    'confidence',
    'short_reason',
  ],
  propertyOrdering: [
    'meme_potential',
    'yugnat_fit',
    'timing_urgency',
    'visual_potential',
    'cultural_relevance',
    'why_memable',
    'meme_angles',
    'recommended_format',
    'cultural_references',
    'primary_theme',
    'timing_window_hours',
    'sensitivity_context',
    'controversy_level',
    'misinformation_risk',
    'legal_caution',
    'tragedy_context',
    'confidence',
    'short_reason',
  ],
}

// ----- OpenAI strict Structured Outputs schema -----

export const OPENAI_RADAR_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    meme_potential:      { type: 'integer' },
    yugnat_fit:          { type: 'integer' },
    timing_urgency:      { type: 'integer' },
    visual_potential:    { type: 'integer' },
    cultural_relevance:  { type: 'integer' },
    why_memable:         { type: 'string'  },
    meme_angles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { angle: { type: 'string' } },
        required: ['angle'],
      },
    },
    recommended_format:  { type: 'string', enum: [...FORMAT_PATTERNS]    },
    cultural_references: { type: 'array',  items: { type: 'string' }     },
    primary_theme:       { type: 'string', enum: [...PRIMARY_THEMES]     },
    timing_window_hours: { type: 'integer' },
    sensitivity_context: { type: 'array',  items: { type: 'string' }     },
    controversy_level:   { type: 'string', enum: [...RADAR_LEVEL_VALUES] },
    misinformation_risk: { type: 'string', enum: [...RADAR_LEVEL_VALUES] },
    legal_caution:       { type: 'string' },
    tragedy_context:     { type: 'string' },
    confidence:          { type: 'number' },
    short_reason:        { type: 'string' },
  },
  required: [
    'meme_potential',
    'yugnat_fit',
    'timing_urgency',
    'visual_potential',
    'cultural_relevance',
    'why_memable',
    'meme_angles',
    'recommended_format',
    'cultural_references',
    'primary_theme',
    'timing_window_hours',
    'sensitivity_context',
    'controversy_level',
    'misinformation_risk',
    'legal_caution',
    'tragedy_context',
    'confidence',
    'short_reason',
  ],
} as const
