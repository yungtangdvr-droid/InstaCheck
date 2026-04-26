// French UI labels for the controlled vocabularies returned by the v2
// Gemini content analysis (see apps/web/lib/gemini/schema.ts). Pure data —
// no React, safe to import from server and client components.
//
// Anything not in the map falls back to the raw value (the schema validator
// already collapses unknown values to 'unknown', so this rarely triggers).

export const PRIMARY_THEME_LABEL_FR: Record<string, string> = {
  work_corporate:      'Travail / corporate',
  social_life:         'Vie sociale',
  relationships:       'Relations',
  fashion_luxury:      'Mode / luxe',
  internet_creator:    'Internet / créateurs',
  politics_society:    'Politique / société',
  food_cooking:        'Cuisine / bouffe',
  health_body:         'Santé / corps',
  parenting_family:    'Parents / famille',
  nightlife_party:     'Nuit / fête',
  subculture_identity: 'Sous-cultures / identité',
  music_popculture:    'Musique / pop culture',
  everyday_absurdity:  'Absurde quotidien',
  sports_fitness:      'Sport / fitness',
  sex_relationships:   'Sexe / couples',
  death_morbidity:     'Mort / morbide',
  art_culture:         'Art / culture',
  consumerism:         'Consommation',
  unknown:             'Thème inconnu',
}

export const HUMOR_TYPE_LABEL_FR: Record<string, string> = {
  absurd:           'Absurde',
  observational:    'Observationnel',
  self_deprecating: 'Auto-dérision',
  ironic:           'Ironique',
  reaction:         'Réaction',
  wholesome:        'Wholesome',
  dark:             'Dark / cynique',
  none:             'Sans humour',
  unknown:          'Humour inconnu',
}

export const FORMAT_PATTERN_LABEL_FR: Record<string, string> = {
  pov:                  'POV',
  starter_pack:         'Starter pack',
  reaction_image:       'Reaction image',
  screenshot_caption:   'Screenshot + légende',
  text_overlay:         'Texte incrusté',
  dialogue:             'Dialogue',
  brand_parody:         'Parodie de marque',
  celebrity_reference:  'Référence célébrité',
  news_reference:       'Référence actu',
  carousel_manifesto:   'Manifesto carousel',
  image_macro:          'Image macro',
  video_thumbnail:      'Vidéo / thumbnail',
  other:                'Autre',
  unknown:              'Format inconnu',
}

export const NICHE_LEVEL_LABEL_FR: Record<string, string> = {
  mainstream: 'Mainstream',
  niche:      'Niche',
  hyperniche: 'Hyper-niche',
  unknown:    'Niveau inconnu',
}

export const REPLICATION_LEVEL_LABEL_FR: Record<string, string> = {
  high:    'Fort potentiel',
  medium:  'Potentiel moyen',
  low:     'Faible potentiel',
  unknown: 'Potentiel inconnu',
}

export const LANGUAGE_LABEL_FR: Record<string, string> = {
  fr:      'Français',
  en:      'Anglais',
  mix:     'Mixte',
  other:   'Autre',
  unknown: 'Langue inconnue',
}

export function primaryThemeLabel(value: string | null | undefined): string {
  if (!value) return PRIMARY_THEME_LABEL_FR.unknown
  return PRIMARY_THEME_LABEL_FR[value] ?? value
}

export function humorTypeLabel(value: string | null | undefined): string {
  if (!value) return HUMOR_TYPE_LABEL_FR.unknown
  return HUMOR_TYPE_LABEL_FR[value] ?? value
}

export function formatPatternLabel(value: string | null | undefined): string {
  if (!value) return FORMAT_PATTERN_LABEL_FR.unknown
  return FORMAT_PATTERN_LABEL_FR[value] ?? value
}

export function nicheLevelLabel(value: string | null | undefined): string {
  if (!value) return NICHE_LEVEL_LABEL_FR.unknown
  return NICHE_LEVEL_LABEL_FR[value] ?? value
}

export function replicationLevelLabel(value: string | null | undefined): string {
  if (!value) return REPLICATION_LEVEL_LABEL_FR.unknown
  return REPLICATION_LEVEL_LABEL_FR[value] ?? value
}

export function languageLabel(value: string | null | undefined): string {
  if (!value) return LANGUAGE_LABEL_FR.unknown
  return LANGUAGE_LABEL_FR[value] ?? value
}

// Tailwind class for the replication potential chip. Greens for "high",
// neutral for medium, dim red for low, very dim for unknown — matches the
// emerald/neutral/red semantics used in PostExplorer & ReplicablePostCard.
export const REPLICATION_LEVEL_CLASS: Record<string, string> = {
  high:    'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  medium:  'border-neutral-700 bg-neutral-900 text-neutral-300',
  low:     'border-red-500/30 bg-red-500/5 text-red-300',
  unknown: 'border-neutral-800 bg-neutral-900 text-neutral-500',
}

export function replicationLevelClass(value: string | null | undefined): string {
  if (!value) return REPLICATION_LEVEL_CLASS.unknown
  return REPLICATION_LEVEL_CLASS[value] ?? REPLICATION_LEVEL_CLASS.unknown
}
