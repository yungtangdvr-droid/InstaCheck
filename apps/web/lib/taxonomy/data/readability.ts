import type { TaxonomyItem } from '@creator-hub/types'

// Axis: readability — *qui peut lire / décoder le post*.
// Advanced axis. Cible audience x effort cognitif.

export const READABILITY_ITEMS: TaxonomyItem[] = [
  { id: 'ultra-lisible',                axis: 'readability', priority: 'advanced', label: 'Ultra lisible',                description: 'Compréhension immédiate, aucun effort.' },
  { id: 'lisible-apres-caption',        axis: 'readability', priority: 'advanced', label: 'Lisible après caption',        description: 'Image opaque seule, claire avec la légende.' },
  { id: 'lisible-internet-culture',     axis: 'readability', priority: 'advanced', label: 'Lisible si internet culture',  description: 'Demande une familiarité internet.' },
  { id: 'lisible-audience-francaise',   axis: 'readability', priority: 'advanced', label: 'Lisible pour audience française', description: 'Demande des codes FR pour décoder.' },
  { id: 'lisible-mode-luxe',            axis: 'readability', priority: 'advanced', label: 'Lisible si mode / luxe',       description: 'Demande des codes mode / luxe pour décoder.' },
  { id: 'lisible-parents',              axis: 'readability', priority: 'advanced', label: 'Lisible pour parents',         description: 'Demande l’expérience parentale pour décoder.' },
  { id: 'lisible-corporate-people',     axis: 'readability', priority: 'advanced', label: 'Lisible pour corporate people', description: 'Demande l’expérience corporate pour décoder.' },
  { id: 'niche-accessible',             axis: 'readability', priority: 'advanced', label: 'Niche accessible',             description: 'Niche, mais accessible avec un peu de contexte.' },
  { id: 'niche-avance',                 axis: 'readability', priority: 'advanced', label: 'Niche avancé',                 description: 'Niche, ne se déchiffre que par les initiés.' },
  { id: 'cryptique',                    axis: 'readability', priority: 'advanced', label: 'Cryptique',                    description: 'Sens volontairement opaque même pour le public régulier.' },
  { id: 'quasi-prive',                  axis: 'readability', priority: 'advanced', label: 'Quasi privé',                  description: 'Lisible essentiellement par un cercle proche.' },
  { id: 'esthetique-sans-comprehension',axis: 'readability', priority: 'advanced', label: 'Esthétique sans compréhension',description: 'Plaît visuellement même sans être compris.' },
]
