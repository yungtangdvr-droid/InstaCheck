import { Type } from '@google/genai'
import { z } from 'zod'

// Frozen reusable vocabularies. We keep them deliberately small and
// stable. Anything outside an enum collapses to 'unknown' during
// validation; the prompt asks Gemini to pick from these lists but we
// accept fall-throughs gracefully rather than failing the row.
// See PROMPT_VERSION in prompt.ts — bump it whenever any vocab below
// changes so dashboards can correlate quality with prompt iterations.

export const LANGUAGE_VALUES   = ['fr', 'en', 'mix', 'other', 'unknown'] as const

export const HUMOR_TYPES       = [
  'absurd',
  'observational',
  'self_deprecating',
  'ironic',
  'reaction',
  'wholesome',
  'dark',
  'none',
  'unknown',
] as const

// Meme-specific format vocabulary. The model classifies the visible
// structure of the post (template, hook, layout) — not the medium type
// (which we already have via `posts.media_type`). Keep this list small
// and stable so format-level aggregates remain comparable over time.
export const FORMAT_PATTERNS   = [
  'pov',
  'starter_pack',
  'reaction_image',
  'screenshot_caption',
  'text_overlay',
  'dialogue',
  'brand_parody',
  'celebrity_reference',
  'news_reference',
  'carousel_manifesto',
  'image_macro',
  'video_thumbnail',
  'other',
  'unknown',
] as const

// Controlled primary_theme vocabulary (v2). The model MUST pick exactly
// one of these labels for `primary_theme`. Anything outside the enum
// collapses to 'unknown' during validation. Nuance lives in
// `secondary_themes`, which stays free-form on purpose (e.g. "HR",
// "burnout", "dinner party", "bouncer", "gallery opening").
export const PRIMARY_THEMES    = [
  'work_corporate',
  'social_life',
  'relationships',
  'fashion_luxury',
  'internet_creator',
  'politics_society',
  'food_cooking',
  'health_body',
  'parenting_family',
  'nightlife_party',
  'subculture_identity',
  'music_popculture',
  'everyday_absurdity',
  'sports_fitness',
  'sex_relationships',
  'death_morbidity',
  'art_culture',
  'consumerism',
  'unknown',
] as const

export const NICHE_LEVELS      = ['mainstream', 'niche', 'hyperniche', 'unknown'] as const

export const REPLICATION_LEVELS = ['high', 'medium', 'low', 'unknown'] as const

// --- Zod runtime validator -----------------------------------------------

const enumWithUnknown = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' && (values as readonly string[]).includes(v) ? v : 'unknown'),
    z.enum(values),
  )

export const ContentAnalysisSchema = z.object({
  visible_text:          z.string().max(2000).default(''),
  language:              enumWithUnknown(LANGUAGE_VALUES),
  primary_theme:         enumWithUnknown(PRIMARY_THEMES),
  secondary_themes:      z.array(z.string().min(1).max(80)).max(8).default([]),
  humor_type:            enumWithUnknown(HUMOR_TYPES),
  format_pattern:        enumWithUnknown(FORMAT_PATTERNS),
  cultural_reference:    z.string().max(200).default(''),
  niche_level:           enumWithUnknown(NICHE_LEVELS),
  replication_potential: enumWithUnknown(REPLICATION_LEVELS),
  confidence:            z.number().min(0).max(1),
  short_reason:          z.string().max(240).default(''),
})

export type ContentAnalysis = z.infer<typeof ContentAnalysisSchema>

// --- Gemini structured-output schema (responseSchema field) --------------
// Gemini accepts an OpenAPI-3-flavoured JSON Schema. We hand-write it to
// keep the contract explicit and avoid pulling zod-to-json-schema. The
// PROPERTY_ORDERING is honoured by Gemini and improves output stability.

export const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    visible_text:          { type: Type.STRING },
    language:              { type: Type.STRING, enum: [...LANGUAGE_VALUES] },
    primary_theme:         { type: Type.STRING, enum: [...PRIMARY_THEMES] },
    secondary_themes:      { type: Type.ARRAY, items: { type: Type.STRING } },
    humor_type:            { type: Type.STRING, enum: [...HUMOR_TYPES] },
    format_pattern:        { type: Type.STRING, enum: [...FORMAT_PATTERNS] },
    cultural_reference:    { type: Type.STRING },
    niche_level:           { type: Type.STRING, enum: [...NICHE_LEVELS] },
    replication_potential: { type: Type.STRING, enum: [...REPLICATION_LEVELS] },
    confidence:            { type: Type.NUMBER },
    short_reason:          { type: Type.STRING },
  },
  required: [
    'visible_text',
    'language',
    'primary_theme',
    'secondary_themes',
    'humor_type',
    'format_pattern',
    'cultural_reference',
    'niche_level',
    'replication_potential',
    'confidence',
    'short_reason',
  ],
  propertyOrdering: [
    'visible_text',
    'language',
    'primary_theme',
    'secondary_themes',
    'humor_type',
    'format_pattern',
    'cultural_reference',
    'niche_level',
    'replication_potential',
    'confidence',
    'short_reason',
  ],
}
