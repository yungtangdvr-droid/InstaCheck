import type { TaxonomyItem } from '@creator-hub/types'

// Axis: social_function — *à quoi sert le post côté audience*.
// Advanced axis. Quel comportement social déclenche-t-il ?

export const SOCIAL_FUNCTION_ITEMS: TaxonomyItem[] = [
  { id: 'faire-rire-immediatement',   axis: 'social_function', priority: 'advanced', label: 'Faire rire immédiatement',   description: 'Effet comique instantané.' },
  { id: 'reconnaissance-situation',   axis: 'social_function', priority: 'advanced', label: 'Reconnaissance d’une situation', description: 'Faire dire « ça, je l’ai vécu ».' },
  { id: 'signaler-appartenance',      axis: 'social_function', priority: 'advanced', label: 'Signaler une appartenance',  description: 'Signal d’appartenance à un groupe.' },
  { id: 'tester-reference',           axis: 'social_function', priority: 'advanced', label: 'Tester une référence',       description: 'Vérifier qui capte la référence.' },
  { id: 'malaise-partage',            axis: 'social_function', priority: 'advanced', label: 'Malaise partagé',            description: 'Créer un malaise commun, presque cathartique.' },
  { id: 'connivence',                 axis: 'social_function', priority: 'advanced', label: 'Connivence',                 description: 'Clin d’œil à l’audience régulière.' },
  { id: 'phrase-reutilisable',        axis: 'social_function', priority: 'advanced', label: 'Phrase réutilisable',        description: 'Phrase qu’on peut reprendre dans la vraie vie.' },
  { id: 'faire-commenter',            axis: 'social_function', priority: 'advanced', label: 'Faire commenter',            description: 'Provoquer un commentaire / une réaction.' },
  { id: 'faire-envoyer',              axis: 'social_function', priority: 'advanced', label: 'Faire envoyer',              description: 'Donner envie d’envoyer le post à quelqu’un.' },
  { id: 'faire-sauvegarder',          axis: 'social_function', priority: 'advanced', label: 'Faire sauvegarder',          description: 'Donner envie de garder le post (save).' },
  { id: 'faire-reflechir',            axis: 'social_function', priority: 'advanced', label: 'Faire réfléchir',            description: 'Provoquer une mini-pensée.' },
  { id: 'ecran-esthetique',           axis: 'social_function', priority: 'advanced', label: 'Écran esthétique',           description: 'Plaire visuellement, sans punchline.' },
  { id: 'ca-me-ressemble',            axis: 'social_function', priority: 'advanced', label: 'Ça me ressemble',            description: 'Identification personnelle de l’audience.' },
  { id: 'c-est-trop-toi',             axis: 'social_function', priority: 'advanced', label: 'C’est trop toi',             description: 'Identification d’un proche par l’audience.' },
  { id: 'declencher-debat',           axis: 'social_function', priority: 'advanced', label: 'Déclencher un débat',        description: 'Provoquer une discussion en commentaires.' },
  { id: 'incomprehension-volontaire', axis: 'social_function', priority: 'advanced', label: 'Incompréhension volontaire', description: 'Frustrer volontairement la compréhension.' },
  { id: 'capital-culturel',           axis: 'social_function', priority: 'advanced', label: 'Capital culturel',           description: 'Marquer un capital culturel partagé.' },
]
