import type {
  TaxonomyAxis,
  TaxonomyAxisDef,
  TaxonomyItem,
  TaxonomyPriority,
} from '@creator-hub/types'

import { AXIS_META, AXIS_ORDER } from './axes'
import { SUBJECT_ITEMS }              from './data/subject'
import { MECHANIC_ITEMS }             from './data/mechanic'
import { MANIFESTATION_ITEMS }        from './data/manifestation'
import { TEXT_IMAGE_RELATION_ITEMS }  from './data/text-image-relation'
import { TONE_ITEMS }                 from './data/tone'
import { REPLICABILITY_ITEMS }        from './data/replicability'
import { STANCE_ITEMS }               from './data/stance'
import { SOCIAL_FUNCTION_ITEMS }      from './data/social-function'
import { INTERTEXTUALITY_ITEMS }      from './data/intertextuality'
import { READABILITY_ITEMS }          from './data/readability'
import { TEMPORALITY_ITEMS }          from './data/temporality'
import { RISK_ITEMS }                 from './data/risk'

// ------------------------------------------------------------
// Public taxonomy module — read-only, in-memory.
// V1 foundation : pas de DB, pas d’écriture, pas d’IA.
// ------------------------------------------------------------

const ITEMS_BY_AXIS: Record<TaxonomyAxis, TaxonomyItem[]> = {
  subject:             SUBJECT_ITEMS,
  mechanic:            MECHANIC_ITEMS,
  manifestation:       MANIFESTATION_ITEMS,
  text_image_relation: TEXT_IMAGE_RELATION_ITEMS,
  tone:                TONE_ITEMS,
  replicability:       REPLICABILITY_ITEMS,
  stance:              STANCE_ITEMS,
  social_function:     SOCIAL_FUNCTION_ITEMS,
  intertextuality:     INTERTEXTUALITY_ITEMS,
  readability:         READABILITY_ITEMS,
  temporality:         TEMPORALITY_ITEMS,
  risk:                RISK_ITEMS,
}

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export class TaxonomyValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Taxonomy is malformed:\n- ${issues.join('\n- ')}`)
    this.name = 'TaxonomyValidationError'
  }
}

// Internal self-check. Runs once at module load time and throws
// loudly if the taxonomy data drifts from its invariants.
//
// Invariants checked :
//   1. Every axis listed in AXIS_ORDER has data.
//   2. Each item.axis matches its parent axis.
//   3. Each item.id is kebab-case.
//   4. Item ids are unique within an axis.
//   5. Each item.priority matches its axis-level priority.
//   6. Labels and descriptions are non-empty.
//   7. The core/advanced split matches the spec.
function validateTaxonomy(): TaxonomyAxisDef[] {
  const issues: string[] = []

  const expectedCore: ReadonlySet<TaxonomyAxis> = new Set([
    'subject', 'mechanic', 'manifestation',
    'text_image_relation', 'tone', 'replicability',
  ])
  const expectedAdvanced: ReadonlySet<TaxonomyAxis> = new Set([
    'stance', 'social_function', 'intertextuality',
    'readability', 'temporality', 'risk',
  ])

  const defs: TaxonomyAxisDef[] = []

  for (const axisId of AXIS_ORDER) {
    const meta = AXIS_META[axisId]
    if (!meta) {
      issues.push(`axis "${axisId}" has no metadata`)
      continue
    }

    let expectedPriority: TaxonomyPriority
    if (expectedCore.has(axisId)) {
      expectedPriority = 'core'
    } else if (expectedAdvanced.has(axisId)) {
      expectedPriority = 'advanced'
    } else {
      issues.push(`axis "${axisId}" not in core/advanced split`)
      expectedPriority = 'core'
    }

    if (meta.priority !== expectedPriority) {
      issues.push(
        `axis "${axisId}" priority is "${meta.priority}", expected "${expectedPriority}"`,
      )
    }
    if (!meta.label.trim())       issues.push(`axis "${axisId}" has empty label`)
    if (!meta.description.trim()) issues.push(`axis "${axisId}" has empty description`)

    const items = ITEMS_BY_AXIS[axisId]
    if (!items || items.length === 0) {
      issues.push(`axis "${axisId}" has no items`)
      defs.push({ ...meta, items: [] })
      continue
    }

    const seen = new Set<string>()
    for (const item of items) {
      if (item.axis !== axisId) {
        issues.push(`item "${item.id}" claims axis "${item.axis}" but lives under "${axisId}"`)
      }
      if (!KEBAB_RE.test(item.id)) {
        issues.push(`item id "${item.id}" (axis "${axisId}") is not kebab-case`)
      }
      if (seen.has(item.id)) {
        issues.push(`item id "${item.id}" is duplicated in axis "${axisId}"`)
      }
      seen.add(item.id)
      if (item.priority !== expectedPriority) {
        issues.push(
          `item "${item.id}" (axis "${axisId}") priority is "${item.priority}", expected "${expectedPriority}"`,
        )
      }
      if (!item.label.trim()) {
        issues.push(`item "${item.id}" (axis "${axisId}") has empty label`)
      }
      if (!item.description.trim()) {
        issues.push(`item "${item.id}" (axis "${axisId}") has empty description`)
      }
      if (item.examples) {
        for (const ex of item.examples) {
          if (!ex.trim()) {
            issues.push(`item "${item.id}" (axis "${axisId}") has empty example`)
          }
        }
      }
    }

    defs.push({ ...meta, items })
  }

  if (issues.length > 0) {
    throw new TaxonomyValidationError(issues)
  }
  return defs
}

const AXES: ReadonlyArray<TaxonomyAxisDef> = Object.freeze(validateTaxonomy())

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

export { AXIS_ORDER, AXIS_META } from './axes'

export function getAxes(): ReadonlyArray<TaxonomyAxisDef> {
  return AXES
}

export function getAxis(axis: TaxonomyAxis): TaxonomyAxisDef | undefined {
  return AXES.find((a) => a.id === axis)
}

export function listCoreAxes(): ReadonlyArray<TaxonomyAxisDef> {
  return AXES.filter((a) => a.priority === 'core')
}

export function listAdvancedAxes(): ReadonlyArray<TaxonomyAxisDef> {
  return AXES.filter((a) => a.priority === 'advanced')
}

export function getItem(axis: TaxonomyAxis, id: string): TaxonomyItem | undefined {
  return getAxis(axis)?.items.find((i) => i.id === id)
}

export function totalItemCount(): number {
  return AXES.reduce((acc, a) => acc + a.items.length, 0)
}
