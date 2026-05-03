import type { TaxonomyItem } from '@creator-hub/types'

// Axis: tone — *registre émotionnel / posture* du post.
// Core axis.

export const TONE_ITEMS: TaxonomyItem[] = [
  { id: 'deadpan',               axis: 'tone', priority: 'core', label: 'Deadpan',               description: 'Inexpressif, sans affect, ton neutre tenu jusqu’au bout.' },
  { id: 'sec',                   axis: 'tone', priority: 'core', label: 'Sec',                   description: 'Court, sans gras, sans fioriture.' },
  { id: 'tendre',                axis: 'tone', priority: 'core', label: 'Tendre',                description: 'Affectueux, doux, sans ironie agressive.' },
  { id: 'noir-leger',            axis: 'tone', priority: 'core', label: 'Noir léger',            description: 'Humour noir, mais traité légèrement.' },
  { id: 'melancolique',          axis: 'tone', priority: 'core', label: 'Mélancolique',          description: 'Tristesse douce, sans drame.' },
  { id: 'fataliste',             axis: 'tone', priority: 'core', label: 'Fataliste',             description: 'Résignation calme : « c’est comme ça ».' },
  { id: 'absurde',               axis: 'tone', priority: 'core', label: 'Absurde',               description: 'Logique cassée, non-sens assumé.' },
  { id: 'cryptique',             axis: 'tone', priority: 'core', label: 'Cryptique',             description: 'Volontairement opaque ou ésotérique.' },
  { id: 'mainstream-lisible',    axis: 'tone', priority: 'core', label: 'Mainstream lisible',    description: 'Lecture immédiate, accessible large public.' },
  { id: 'niche',                 axis: 'tone', priority: 'core', label: 'Niche',                 description: 'Adressé à un sous-public spécifique.' },
  { id: 'franglais',             axis: 'tone', priority: 'core', label: 'Franglais',             description: 'Mélange français / anglais comme registre.' },
  { id: 'faussement-premium',    axis: 'tone', priority: 'core', label: 'Faussement premium',    description: 'Pose de luxe, sans en avoir la substance.' },
  { id: 'faussement-corporate',  axis: 'tone', priority: 'core', label: 'Faussement corporate',  description: 'Pose de manager / consultant détournée.' },
  { id: 'faussement-therapeutique', axis: 'tone', priority: 'core', label: 'Faussement thérapeutique', description: 'Ton thérapeute / psy détourné.' },
  { id: 'faussement-spirituel',  axis: 'tone', priority: 'core', label: 'Faussement spirituel',  description: 'Pose mystique ou spirituelle pastichée.' },
  { id: 'autoderision',          axis: 'tone', priority: 'core', label: 'Autodérision',          description: 'Le créateur se tourne lui-même en ridicule.' },
  { id: 'snob-drole',            axis: 'tone', priority: 'core', label: 'Snob drôle',            description: 'Snobisme assumé pour rire.' },
  { id: 'naif-volontaire',       axis: 'tone', priority: 'core', label: 'Naïf volontaire',       description: 'Naïveté simulée comme posture.' },
  { id: 'elegant-debile',        axis: 'tone', priority: 'core', label: 'Élégant débile',        description: 'Forme élégante, fond volontairement bête.' },
  { id: 'detache',               axis: 'tone', priority: 'core', label: 'Détaché',               description: 'Distance émotionnelle, ne s’engage pas.' },
  { id: 'blase',                 axis: 'tone', priority: 'core', label: 'Blasé',                 description: 'Lassitude affichée, plus rien ne surprend.' },
  { id: 'honteux',               axis: 'tone', priority: 'core', label: 'Honteux',               description: 'Posture d’aveu honteux, gêne mise en scène.' },
  { id: 'lucide',                axis: 'tone', priority: 'core', label: 'Lucide',                description: 'Constat clair, pas de pathos.' },
  { id: 'anti-heroique',         axis: 'tone', priority: 'core', label: 'Anti-héroïque',         description: 'Héros ordinaire qui ne gagne rien, posture assumée.' },
]
