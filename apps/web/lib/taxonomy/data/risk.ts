import type { TaxonomyItem } from '@creator-hub/types'

// Axis: risk — *risques éditoriaux* à arbitrer avant de poster ou de remixer.
// Advanced axis.

export const RISK_ITEMS: TaxonomyItem[] = [
  { id: 'risque-redite',                axis: 'risk', priority: 'advanced', label: 'Risque de redite',                description: 'Trop proche d’un post déjà publié.' },
  { id: 'risque-trop-niche',            axis: 'risk', priority: 'advanced', label: 'Risque trop niche',               description: 'Compréhensible par trop peu de monde.' },
  { id: 'risque-trop-mainstream',       axis: 'risk', priority: 'advanced', label: 'Risque trop mainstream',          description: 'Trop générique, perd la signature.' },
  { id: 'risque-trop-agressif',         axis: 'risk', priority: 'advanced', label: 'Risque trop agressif',            description: 'Ton frontal qui peut blesser inutilement.' },
  { id: 'risque-trop-cryptique',        axis: 'risk', priority: 'advanced', label: 'Risque trop cryptique',           description: 'Tellement opaque que l’audience décroche.' },
  { id: 'risque-marque-mal-comprise',   axis: 'risk', priority: 'advanced', label: 'Risque marque mal comprise',      description: 'La marque peut prendre la blague pour elle.' },
  { id: 'risque-private-joke',          axis: 'risk', priority: 'advanced', label: 'Risque private joke',             description: 'Trop privé, ne parle qu’à un cercle proche.' },
  { id: 'risque-faible-caption',        axis: 'risk', priority: 'advanced', label: 'Risque caption faible',           description: 'La caption ne tient pas l’image.' },
  { id: 'risque-image-faible',          axis: 'risk', priority: 'advanced', label: 'Risque image faible',             description: 'L’image ne tient pas la caption.' },
  { id: 'risque-reference-perimee',     axis: 'risk', priority: 'advanced', label: 'Risque référence périmée',        description: 'La référence va vieillir vite.' },
  { id: 'risque-repetition-format',     axis: 'risk', priority: 'advanced', label: 'Risque répétition format',        description: 'Le format devient mécanique sur le compte.' },
  { id: 'risque-fatigue-audience',      axis: 'risk', priority: 'advanced', label: 'Risque fatigue audience',         description: 'L’audience régulière peut saturer.' },
  { id: 'risque-proche-ancien-post',    axis: 'risk', priority: 'advanced', label: 'Risque proche d’un ancien post',  description: 'Proche d’un post précis déjà fait.' },
  { id: 'risque-hors-univers-yugnat',   axis: 'risk', priority: 'advanced', label: 'Risque hors univers Yugnat',      description: 'Sort de la signature éditoriale du compte.' },
]
