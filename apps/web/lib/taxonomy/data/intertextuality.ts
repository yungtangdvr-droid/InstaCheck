import type { TaxonomyItem } from '@creator-hub/types'

// Axis: intertextuality — *à quels univers culturels le post emprunte*.
// Advanced axis.

export const INTERTEXTUALITY_ITEMS: TaxonomyItem[] = [
  { id: 'pop-culture',              axis: 'intertextuality', priority: 'advanced', label: 'Pop culture',              description: 'Cinéma, série, musique, célébrités mainstream.' },
  { id: 'mode-luxe',                axis: 'intertextuality', priority: 'advanced', label: 'Mode / luxe',              description: 'Univers mode et luxe (campagnes, codes).' },
  { id: 'internet-native',          axis: 'intertextuality', priority: 'advanced', label: 'Internet-native',          description: 'Référence purement internet, sans ancrage offline.' },
  { id: 'tiktok-instagram',         axis: 'intertextuality', priority: 'advanced', label: 'TikTok / Instagram',       description: 'Référence à un format / trend TikTok ou Instagram.' },
  { id: 'twitter-energy',           axis: 'intertextuality', priority: 'advanced', label: 'Twitter energy',           description: 'Énergie Twitter / X (sec, court, chute texte).' },
  { id: 'linkedin-energy',          axis: 'intertextuality', priority: 'advanced', label: 'LinkedIn energy',          description: 'Énergie LinkedIn (corporate sincérité).' },
  { id: 'reddit-forum-energy',      axis: 'intertextuality', priority: 'advanced', label: 'Reddit / forum energy',    description: 'Énergie forum, threads, niches verbeuses.' },
  { id: 'actualite',                axis: 'intertextuality', priority: 'advanced', label: 'Actualité',                description: 'Référence à l’actu chaude.' },
  { id: 'politique-soft',           axis: 'intertextuality', priority: 'advanced', label: 'Politique soft',           description: 'Allusion politique légère, non militante.' },
  { id: 'marque-precise',           axis: 'intertextuality', priority: 'advanced', label: 'Marque précise',           description: 'Référence à une marque identifiable.' },
  { id: 'celebrite',                axis: 'intertextuality', priority: 'advanced', label: 'Célébrité',                description: 'Référence à une célébrité identifiable.' },
  { id: 'objet-culturel',           axis: 'intertextuality', priority: 'advanced', label: 'Objet culturel',           description: 'Renvoi à un livre, film, œuvre précise.' },
  { id: 'citation-detournee',       axis: 'intertextuality', priority: 'advanced', label: 'Citation détournée',       description: 'Citation existante détournée.' },
  { id: 'format-meme-existant',     axis: 'intertextuality', priority: 'advanced', label: 'Format meme existant',     description: 'S’appuie sur un format de meme déjà installé.' },
  { id: 'template-connu',           axis: 'intertextuality', priority: 'advanced', label: 'Template connu',           description: 'S’appuie sur un template visuel reconnaissable.' },
  { id: 'reference-obscure',        axis: 'intertextuality', priority: 'advanced', label: 'Référence obscure',        description: 'Référence très peu identifiable.' },
  { id: 'reference-francaise',      axis: 'intertextuality', priority: 'advanced', label: 'Référence française',      description: 'Ancrage culturel français explicite.' },
  { id: 'reference-americaine',     axis: 'intertextuality', priority: 'advanced', label: 'Référence américaine',     description: 'Ancrage culturel américain explicite.' },
  { id: 'reference-generationnelle',axis: 'intertextuality', priority: 'advanced', label: 'Référence générationnelle', description: 'Référence liée à une génération précise.' },
  { id: 'reference-parentalite',    axis: 'intertextuality', priority: 'advanced', label: 'Référence parentalité',    description: 'Renvoi à l’univers parental.' },
  { id: 'reference-corporate',      axis: 'intertextuality', priority: 'advanced', label: 'Référence corporate',      description: 'Renvoi à l’univers corporate / management.' },
  { id: 'reference-wellness',       axis: 'intertextuality', priority: 'advanced', label: 'Référence wellness',       description: 'Renvoi à l’univers wellness.' },
  { id: 'reference-art-design',     axis: 'intertextuality', priority: 'advanced', label: 'Référence art / design',   description: 'Renvoi à l’univers art / design.' },
  { id: 'reference-religion-spiritualite', axis: 'intertextuality', priority: 'advanced', label: 'Référence religion / spiritualité', description: 'Renvoi religieux ou spirituel.' },
  { id: 'reference-finance',        axis: 'intertextuality', priority: 'advanced', label: 'Référence finance',        description: 'Renvoi à l’univers finance / marchés.' },
  { id: 'aucune-reference-explicite', axis: 'intertextuality', priority: 'advanced', label: 'Aucune référence explicite', description: 'Pas de référence intertextuelle identifiable.' },
]
