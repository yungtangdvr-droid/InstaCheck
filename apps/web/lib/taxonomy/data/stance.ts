import type { TaxonomyItem } from '@creator-hub/types'

// Axis: stance — *position prise par le post* vis-à-vis de son sujet.
// Advanced axis.

export const STANCE_ITEMS: TaxonomyItem[] = [
  { id: 'critique',                  axis: 'stance', priority: 'advanced', label: 'Critique',                  description: 'Critique ouverte du sujet.' },
  { id: 'adhesion-ironique',         axis: 'stance', priority: 'advanced', label: 'Adhésion ironique',         description: 'Adhésion affichée, ironie sous-jacente.' },
  { id: 'distance-ironique',         axis: 'stance', priority: 'advanced', label: 'Distance ironique',         description: 'Distance ironique sans rejet frontal.' },
  { id: 'auto-accusation',           axis: 'stance', priority: 'advanced', label: 'Auto-accusation',           description: 'Le créateur s’accuse lui-même.' },
  { id: 'confession',                axis: 'stance', priority: 'advanced', label: 'Confession',                description: 'Aveu personnel mis en scène.' },
  { id: 'observation-sociale',       axis: 'stance', priority: 'advanced', label: 'Observation sociale',       description: 'Constat sociologique froid.' },
  { id: 'ridiculisation-douce',      axis: 'stance', priority: 'advanced', label: 'Ridiculisation douce',      description: 'Moquerie légère, sans agressivité.' },
  { id: 'ridiculisation-agressive',  axis: 'stance', priority: 'advanced', label: 'Ridiculisation agressive',  description: 'Moquerie frontale et appuyée.' },
  { id: 'nostalgie',                 axis: 'stance', priority: 'advanced', label: 'Nostalgie',                 description: 'Posture nostalgique assumée.' },
  { id: 'desillusion',               axis: 'stance', priority: 'advanced', label: 'Désillusion',               description: 'Désenchantement clair.' },
  { id: 'aspiration-contrariee',     axis: 'stance', priority: 'advanced', label: 'Aspiration contrariée',     description: 'Désir d’y arriver, mais frein affiché.' },
  { id: 'desir-honteux',             axis: 'stance', priority: 'advanced', label: 'Désir honteux',             description: 'Désir nommé avec gêne.' },
  { id: 'resignation',               axis: 'stance', priority: 'advanced', label: 'Résignation',               description: 'Acceptation passive.' },
  { id: 'refus-de-performer',        axis: 'stance', priority: 'advanced', label: 'Refus de performer',        description: 'Refus explicite des codes de performance.' },
  { id: 'anti-hype',                 axis: 'stance', priority: 'advanced', label: 'Anti-hype',                 description: 'Refus du hype, posture critique.' },
  { id: 'anti-bien-etre',            axis: 'stance', priority: 'advanced', label: 'Anti-bien-être',            description: 'Critique de l’injonction au bien-être.' },
  { id: 'anti-travail',              axis: 'stance', priority: 'advanced', label: 'Anti-travail',              description: 'Critique du rapport au travail.' },
  { id: 'anti-consommation',         axis: 'stance', priority: 'advanced', label: 'Anti-consommation',         description: 'Critique de la consommation.' },
  { id: 'pro-consommation-honteuse', axis: 'stance', priority: 'advanced', label: 'Pro-consommation honteuse', description: 'Adhésion gênée à la consommation.' },
  { id: 'admiration-sincere-cachee', axis: 'stance', priority: 'advanced', label: 'Admiration sincère cachée', description: 'Admiration réelle dissimulée par l’ironie.' },
  { id: 'ambivalence',               axis: 'stance', priority: 'advanced', label: 'Ambivalence',               description: 'Position délibérément double.' },
]
