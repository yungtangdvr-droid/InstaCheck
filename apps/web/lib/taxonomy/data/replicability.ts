import type { TaxonomyItem } from '@creator-hub/types'

// Axis: replicability — *jusqu’où ce post peut devenir un pattern réutilisable*.
// Core axis. Sert directement à alimenter les remix candidates.

export const REPLICABILITY_ITEMS: TaxonomyItem[] = [
  { id: 'tres-replicable',                axis: 'replicability', priority: 'core', label: 'Très réplicable',                description: 'Pattern reproductible quasi à l’identique.' },
  { id: 'replicable-nouveau-sujet',       axis: 'replicability', priority: 'core', label: 'Réplicable, nouveau sujet',      description: 'Format reproductible si on change le sujet.' },
  { id: 'replicable-variation-forte',     axis: 'replicability', priority: 'core', label: 'Réplicable, variation forte',    description: 'Reproductible avec une variation marquée.' },
  { id: 'replicable-carrousel',           axis: 'replicability', priority: 'core', label: 'Réplicable en carrousel',        description: 'Adaptable en format carrousel.' },
  { id: 'replicable-caption',             axis: 'replicability', priority: 'core', label: 'Réplicable côté caption',        description: 'Le pattern réutilisable est la légende.' },
  { id: 'replicable-image-precise',       axis: 'replicability', priority: 'core', label: 'Réplicable autour d’une image précise', description: 'Pattern possible à condition de réutiliser ce type d’image.' },
  { id: 'risque-repetition',              axis: 'replicability', priority: 'core', label: 'Risque de répétition',           description: 'Risque de redite si on reproduit.' },
  { id: 'deja-trop-utilise',              axis: 'replicability', priority: 'core', label: 'Déjà trop utilisé',              description: 'Format déjà saturé sur le compte.' },
  { id: 'one-shot',                       axis: 'replicability', priority: 'core', label: 'One-shot',                       description: 'Post non reproductible, valeur unique.' },
  { id: 'transformer-en-serie',           axis: 'replicability', priority: 'core', label: 'À transformer en série',         description: 'Bonne base pour devenir une série.' },
  { id: 'transformer-en-format-marque',   axis: 'replicability', priority: 'core', label: 'À transformer en format marque', description: 'Adaptable en format de collab marque.' },
  { id: 'transformer-en-newsletter',      axis: 'replicability', priority: 'core', label: 'À transformer en newsletter',    description: 'Bonne matière pour la newsletter.' },
  { id: 'transformer-en-collab',          axis: 'replicability', priority: 'core', label: 'À transformer en collab',        description: 'Bon point de départ pour une collab.' },
  { id: 'a-eviter',                       axis: 'replicability', priority: 'core', label: 'À éviter',                       description: 'Pattern à ne pas reprendre tel quel.' },
]
