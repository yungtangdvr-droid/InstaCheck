import type { TaxonomyItem } from '@creator-hub/types'

// Axis: temporality — *rapport au temps* du post (durée de vie, contexte calendaire).
// Advanced axis.

export const TEMPORALITY_ITEMS: TaxonomyItem[] = [
  { id: 'evergreen',              axis: 'temporality', priority: 'advanced', label: 'Evergreen',              description: 'Reste pertinent indéfiniment.' },
  { id: 'actualite-chaude',       axis: 'temporality', priority: 'advanced', label: 'Actualité chaude',       description: 'Lié à une actu très récente, demi-vie courte.' },
  { id: 'actualite-froide',       axis: 'temporality', priority: 'advanced', label: 'Actualité froide',       description: 'Lié à une actu installée, dure plus longtemps.' },
  { id: 'trend-internet',         axis: 'temporality', priority: 'advanced', label: 'Trend internet',         description: 'Trend internet en cours.' },
  { id: 'trend-mode',             axis: 'temporality', priority: 'advanced', label: 'Trend mode',             description: 'Trend mode en cours.' },
  { id: 'trend-marque',           axis: 'temporality', priority: 'advanced', label: 'Trend marque',           description: 'Trend autour d’une marque précise.' },
  { id: 'moment-saisonnier',      axis: 'temporality', priority: 'advanced', label: 'Moment saisonnier',      description: 'Lié à une saison (été, rentrée, hiver).' },
  { id: 'marronnier',             axis: 'temporality', priority: 'advanced', label: 'Marronnier',             description: 'Marronnier calendaire (Noël, Saint-Valentin, etc.).' },
  { id: 'evenement-personnel',    axis: 'temporality', priority: 'advanced', label: 'Événement personnel',    description: 'Lié à un événement perso du créateur.' },
  { id: 'post-reaction',          axis: 'temporality', priority: 'advanced', label: 'Post réaction',          description: 'Réaction directe à quelque chose qui vient de se passer.' },
  { id: 'post-observation',       axis: 'temporality', priority: 'advanced', label: 'Post observation',       description: 'Constat à froid, pas en réaction immédiate.' },
  { id: 'post-archive',           axis: 'temporality', priority: 'advanced', label: 'Post archive',           description: 'Recyclage / republication d’un contenu archive.' },
  { id: 'retour-ancien-pattern',  axis: 'temporality', priority: 'advanced', label: 'Retour d’un ancien pattern', description: 'Reprise d’un pattern déjà utilisé sur le compte.' },
  { id: 'format-crise',           axis: 'temporality', priority: 'advanced', label: 'Format crise',           description: 'Format spécifiquement « moment de crise / panique ».' },
  { id: 'format-fatigue',         axis: 'temporality', priority: 'advanced', label: 'Format fatigue',         description: 'Format pensé pour les phases de fatigue.' },
  { id: 'format-week-end',        axis: 'temporality', priority: 'advanced', label: 'Format week-end',        description: 'Pensé pour le week-end.' },
  { id: 'format-lundi',           axis: 'temporality', priority: 'advanced', label: 'Format lundi',           description: 'Pensé pour le lundi (retour boulot).' },
  { id: 'format-vacances',        axis: 'temporality', priority: 'advanced', label: 'Format vacances',        description: 'Pensé pour les vacances.' },
]
