import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type { TCreativePattern, TPatternIdea } from '@creator-hub/types'
import {
  listPatterns,
  getPatternExamples,
  getPatternExamplePostMeta,
} from '../patterns/get-patterns'
import { buildPatternIdea } from './build-pattern-idea'

type Supabase = SupabaseClient<Database>

export const PATTERN_IDEA_LIMIT          = 20
export const PATTERN_IDEA_EXAMPLES_TOPK  = 3

// A pattern produces an idea only when it has an actionable recommendation.
// `drop` patterns describe what NOT to do — they're not suggestions to try.
// `null` (recommendation) means sample_size < 4 → insufficient evidence.
function qualifies(pattern: TCreativePattern): boolean {
  return pattern.recommendation === 'replicate' || pattern.recommendation === 'adapt'
}

// Ordering: replicate before adapt, then by Bayes desc, then sample desc.
// Already partially sorted by listPatterns (Bayes desc, sample desc).
function orderByPriority(a: TCreativePattern, b: TCreativePattern): number {
  const aRep = a.recommendation === 'replicate' ? 0 : 1
  const bRep = b.recommendation === 'replicate' ? 0 : 1
  if (aRep !== bRep) return aRep - bRep
  if (a.bayesAdjustedScore !== b.bayesAdjustedScore) {
    return b.bayesAdjustedScore - a.bayesAdjustedScore
  }
  return b.sampleSize - a.sampleSize
}

export async function listPatternIdeas(
  supabase: Supabase,
  limit:    number = PATTERN_IDEA_LIMIT,
): Promise<TPatternIdea[]> {
  const patterns = await listPatterns(supabase)
  const selected = patterns.filter(qualifies).sort(orderByPriority).slice(0, limit)
  if (selected.length === 0) return []

  // N+1 mitigation: examples are still per-pattern (the view is indexed on
  // pattern_key), but we only pay it for the capped set. Fetched in parallel.
  const exampleLists = await Promise.all(
    selected.map((p) => getPatternExamples(supabase, p.patternKey, PATTERN_IDEA_EXAMPLES_TOPK)),
  )

  const allPostIds = Array.from(
    new Set(exampleLists.flat().map((e) => e.postId)),
  )
  const metaMap = await getPatternExamplePostMeta(supabase, allPostIds)
  const metaSlim = new Map<string, { caption: string | null; permalink: string | null }>()
  for (const [id, m] of metaMap) {
    metaSlim.set(id, { caption: m.caption, permalink: m.permalink })
  }

  const ideas: TPatternIdea[] = []
  for (let i = 0; i < selected.length; i++) {
    ideas.push(buildPatternIdea(selected[i], exampleLists[i], metaSlim))
  }
  return ideas
}
