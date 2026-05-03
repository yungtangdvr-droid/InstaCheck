// ============================================================
// Creator Hub — Creative Taxonomy V1 (read-only foundation)
// ============================================================
//
// Stable type definitions for the Yugnat creative taxonomy.
// Inspired by meme studies (content / form / stance ;
// manifestation / behavior / ideal ; humor, intertextuality,
// anomalous juxtaposition ; cultural belonging / cultural
// capital). The taxonomy is *purely descriptive* in V1: no DB
// migration, no annotation UI, no scoring. It is the contract
// that future archive annotation and remix-candidate features
// will reference by stable id.

export type TaxonomyAxis =
  | 'subject'
  | 'mechanic'
  | 'manifestation'
  | 'text_image_relation'
  | 'tone'
  | 'replicability'
  | 'stance'
  | 'social_function'
  | 'intertextuality'
  | 'readability'
  | 'temporality'
  | 'risk'

export type TaxonomyPriority = 'core' | 'advanced'

export type TaxonomyItem = {
  id:           string            // stable kebab-case, unique within axis
  axis:         TaxonomyAxis
  label:        string            // FR / franglais, operator-facing
  description:  string            // 1-line gloss
  examples?:    string[]          // optional illustrative examples
  priority:     TaxonomyPriority
}

export type TaxonomyAxisDef = {
  id:           TaxonomyAxis
  label:        string
  description:  string
  priority:     TaxonomyPriority  // axis-level core vs advanced
  items:        TaxonomyItem[]
}
