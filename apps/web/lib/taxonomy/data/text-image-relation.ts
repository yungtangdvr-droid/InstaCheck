import type { TaxonomyItem } from '@creator-hub/types'

// Axis: text_image_relation — *comment la légende et l’image dialoguent*.
// Core axis. Particulièrement central sur un compte meme.

export const TEXT_IMAGE_RELATION_ITEMS: TaxonomyItem[] = [
  { id: 'text-describes-image',                axis: 'text_image_relation', priority: 'core', label: 'Texte décrit l’image',                description: 'La légende dit littéralement ce que l’image montre.' },
  { id: 'text-contradicts-image',              axis: 'text_image_relation', priority: 'core', label: 'Texte contredit l’image',             description: 'Le texte dit l’inverse de ce que l’image montre.' },
  { id: 'text-recontextualizes-image',         axis: 'text_image_relation', priority: 'core', label: 'Texte recontextualise l’image',       description: 'Le texte recadre la lecture de l’image.' },
  { id: 'text-makes-image-sad',                axis: 'text_image_relation', priority: 'core', label: 'Texte rend l’image triste',           description: 'La légende plombe une image neutre ou joyeuse.' },
  { id: 'text-makes-image-premium',            axis: 'text_image_relation', priority: 'core', label: 'Texte rend l’image premium',          description: 'La légende anoblit une image banale.' },
  { id: 'text-makes-image-stupid',             axis: 'text_image_relation', priority: 'core', label: 'Texte rend l’image idiote',           description: 'La légende abaisse une image sérieuse.' },
  { id: 'text-turns-image-into-confession',    axis: 'text_image_relation', priority: 'core', label: 'Texte transforme l’image en aveu',    description: 'L’image devient un prétexte à confession personnelle.' },
  { id: 'text-turns-image-into-advice',        axis: 'text_image_relation', priority: 'core', label: 'Texte transforme l’image en conseil', description: 'L’image devient illustration d’un conseil.' },
  { id: 'text-turns-image-into-social-critique',axis: 'text_image_relation', priority: 'core', label: 'Texte transforme l’image en critique sociale', description: 'L’image devient prétexte à critique sociale.' },
  { id: 'too-serious-caption',                 axis: 'text_image_relation', priority: 'core', label: 'Caption trop sérieuse',                description: 'Légende disproportionnément sérieuse pour le visuel.' },
  { id: 'image-as-proof',                      axis: 'text_image_relation', priority: 'core', label: 'Image comme preuve',                  description: 'L’image atteste / illustre ce que dit le texte.' },
  { id: 'image-as-decor',                      axis: 'text_image_relation', priority: 'core', label: 'Image comme décor',                   description: 'L’image est un fond, le sens est ailleurs.' },
  { id: 'image-as-pretext',                    axis: 'text_image_relation', priority: 'core', label: 'Image comme prétexte',                description: 'L’image n’est qu’un déclencheur du texte.' },
  { id: 'caption-essential',                   axis: 'text_image_relation', priority: 'core', label: 'Caption essentielle',                 description: 'Sans la légende, le post n’existe pas.' },
  { id: 'caption-optional',                    axis: 'text_image_relation', priority: 'core', label: 'Caption optionnelle',                 description: 'Le post fonctionne sans la légende.' },
  { id: 'no-caption',                          axis: 'text_image_relation', priority: 'core', label: 'Pas de caption',                      description: 'Pas de légende IG ; tout vit dans l’image.' },
  { id: 'punchline-in-caption',                axis: 'text_image_relation', priority: 'core', label: 'Punchline dans la caption',           description: 'La chute est portée par la légende.' },
  { id: 'punchline-in-image',                  axis: 'text_image_relation', priority: 'core', label: 'Punchline dans l’image',              description: 'La chute est portée par l’image.' },
  { id: 'double-punchline',                    axis: 'text_image_relation', priority: 'core', label: 'Double punchline',                    description: 'Deux chutes : une dans l’image, une dans la légende.' },
]
