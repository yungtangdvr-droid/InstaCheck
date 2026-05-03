import type { TaxonomyItem } from '@creator-hub/types'

// Axis: manifestation — *forme matérielle / format visuel* du post.
// Core axis. C’est ce qu’on voit physiquement.

export const MANIFESTATION_ITEMS: TaxonomyItem[] = [
  { id: 'image-simple',             axis: 'manifestation', priority: 'core', label: 'Image simple',             description: 'Une seule image, sans surcouche ni découpe.' },
  { id: 'photo-trouvee',            axis: 'manifestation', priority: 'core', label: 'Photo trouvée',            description: 'Photo glanée sur le web, repostée telle quelle.' },
  { id: 'photo-personnelle',        axis: 'manifestation', priority: 'core', label: 'Photo personnelle',        description: 'Photo prise par le créateur lui-même.' },
  { id: 'photo-low-res',            axis: 'manifestation', priority: 'core', label: 'Photo low-res',            description: 'Image basse résolution assumée comme esthétique.' },
  { id: 'photo-premium-detournee',  axis: 'manifestation', priority: 'core', label: 'Photo premium détournée',  description: 'Visuel premium (luxe, mode, food) recadré ironiquement.' },
  { id: 'screenshot',               axis: 'manifestation', priority: 'core', label: 'Screenshot',               description: 'Capture d’écran générique.' },
  { id: 'screenshot-app',           axis: 'manifestation', priority: 'core', label: 'Screenshot d’app',         description: 'Capture d’écran d’une app mobile (notes, calendrier, etc.).' },
  { id: 'screenshot-message',       axis: 'manifestation', priority: 'core', label: 'Screenshot message',       description: 'Capture de conversation iMessage / WhatsApp / DM.' },
  { id: 'screenshot-web',           axis: 'manifestation', priority: 'core', label: 'Screenshot web',           description: 'Capture de page web, article, tweet.' },
  { id: 'meme-textuel',             axis: 'manifestation', priority: 'core', label: 'Meme textuel',             description: 'Meme dont l’essentiel est porté par le texte.' },
  { id: 'image-macro',              axis: 'manifestation', priority: 'core', label: 'Image macro',              description: 'Image avec texte incrusté en bandeau (format meme classique).' },
  { id: 'carrousel-narratif',       axis: 'manifestation', priority: 'core', label: 'Carrousel narratif',       description: 'Carrousel qui raconte une progression slide après slide.' },
  { id: 'carrousel-accumulation',   axis: 'manifestation', priority: 'core', label: 'Carrousel accumulation',   description: 'Carrousel qui empile des variations d’un même motif.' },
  { id: 'carrousel-archive',        axis: 'manifestation', priority: 'core', label: 'Carrousel archive',        description: 'Carrousel-collection, type moodboard / archive.' },
  { id: 'dialogue',                 axis: 'manifestation', priority: 'core', label: 'Dialogue',                 description: 'Échange à deux voix mis en scène.' },
  { id: 'liste',                    axis: 'manifestation', priority: 'core', label: 'Liste',                    description: 'Liste numérotée ou à puces comme structure principale.' },
  { id: 'faux-tableau',             axis: 'manifestation', priority: 'core', label: 'Faux tableau',             description: 'Tableau / matrice / Excel pastiché.' },
  { id: 'faux-formulaire',          axis: 'manifestation', priority: 'core', label: 'Faux formulaire',          description: 'Formulaire ou questionnaire pastiché.' },
  { id: 'faux-screenshot-corporate',axis: 'manifestation', priority: 'core', label: 'Faux screenshot corporate', description: 'Capture d’écran « pro » fabriquée (slack, mail interne, slide).' },
  { id: 'objet-isole',              axis: 'manifestation', priority: 'core', label: 'Objet isolé',              description: 'Objet seul, fond neutre, traitement type packshot.' },
  { id: 'visuel-mode-luxe',         axis: 'manifestation', priority: 'core', label: 'Visuel mode / luxe',       description: 'Visuel à esthétique mode ou luxe.' },
  { id: 'visuel-food',              axis: 'manifestation', priority: 'core', label: 'Visuel food',              description: 'Visuel food, plat, scène de table.' },
  { id: 'visuel-bebe-famille',      axis: 'manifestation', priority: 'core', label: 'Visuel bébé / famille',    description: 'Scène famille / bébé.' },
  { id: 'interface-detournee',      axis: 'manifestation', priority: 'core', label: 'Interface détournée',      description: 'UI réelle ou fabriquée utilisée comme support du gag.' },
  { id: 'affiche-poster',           axis: 'manifestation', priority: 'core', label: 'Affiche / poster',         description: 'Format affiche, type print / poster.' },
  { id: 'meme-minimal',             axis: 'manifestation', priority: 'core', label: 'Meme minimal',             description: 'Meme épuré : très peu d’éléments à l’écran.' },
  { id: 'meme-dense',               axis: 'manifestation', priority: 'core', label: 'Meme dense',               description: 'Meme chargé : beaucoup de texte / éléments.' },
  { id: 'meme-cryptique',           axis: 'manifestation', priority: 'core', label: 'Meme cryptique',           description: 'Sens volontairement opaque, demande un effort.' },
  { id: 'meme-lisible',             axis: 'manifestation', priority: 'core', label: 'Meme lisible',             description: 'Sens immédiat, lisibilité maximale.' },
]
