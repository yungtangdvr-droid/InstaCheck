import type { TaxonomyAxis, TaxonomyPriority } from '@creator-hub/types'

// Axis-level metadata (label, description, priority). Stable order :
// d’abord les 6 axes core, puis les 6 axes advanced, dans l’ordre
// du brief V1.

export type AxisMeta = {
  id:          TaxonomyAxis
  label:       string
  description: string
  priority:    TaxonomyPriority
}

export const AXIS_ORDER: TaxonomyAxis[] = [
  // core
  'subject',
  'mechanic',
  'manifestation',
  'text_image_relation',
  'tone',
  'replicability',
  // advanced
  'stance',
  'social_function',
  'intertextuality',
  'readability',
  'temporality',
  'risk',
]

export const AXIS_META: Record<TaxonomyAxis, AxisMeta> = {
  subject: {
    id:          'subject',
    label:       'Sujet',
    description: 'De quoi le post parle. Univers, objet, scène.',
    priority:    'core',
  },
  mechanic: {
    id:          'mechanic',
    label:       'Mécanique',
    description: 'Le ressort comique ou sémantique qui produit l’effet.',
    priority:    'core',
  },
  manifestation: {
    id:          'manifestation',
    label:       'Manifestation',
    description: 'Forme matérielle / format visuel du post.',
    priority:    'core',
  },
  text_image_relation: {
    id:          'text_image_relation',
    label:       'Texte ↔ image',
    description: 'Comment la légende et l’image dialoguent.',
    priority:    'core',
  },
  tone: {
    id:          'tone',
    label:       'Ton',
    description: 'Registre émotionnel, posture du post.',
    priority:    'core',
  },
  replicability: {
    id:          'replicability',
    label:       'Réplicabilité',
    description: 'Jusqu’où ce post peut devenir un pattern réutilisable.',
    priority:    'core',
  },
  stance: {
    id:          'stance',
    label:       'Posture',
    description: 'Position prise par le post vis-à-vis de son sujet.',
    priority:    'advanced',
  },
  social_function: {
    id:          'social_function',
    label:       'Fonction sociale',
    description: 'À quoi sert le post côté audience.',
    priority:    'advanced',
  },
  intertextuality: {
    id:          'intertextuality',
    label:       'Intertextualité',
    description: 'À quels univers culturels le post emprunte.',
    priority:    'advanced',
  },
  readability: {
    id:          'readability',
    label:       'Lisibilité',
    description: 'Qui peut lire / décoder le post.',
    priority:    'advanced',
  },
  temporality: {
    id:          'temporality',
    label:       'Temporalité',
    description: 'Rapport au temps du post (durée de vie, contexte calendaire).',
    priority:    'advanced',
  },
  risk: {
    id:          'risk',
    label:       'Risques',
    description: 'Risques éditoriaux à arbitrer avant de poster ou de remixer.',
    priority:    'advanced',
  },
}
