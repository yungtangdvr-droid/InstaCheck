// Single source of truth for "is this post pending content analysis?".
// Used by both the candidate picker (`pickCandidates` in
// run-analysis-batch.ts) and the Data Health fetcher so the count shown
// in the panel matches what /api/content/analyze-new will actually process.
//
// A post is pending unless it already has a row in post_content_analysis
// with BOTH status='completed' AND prompt_version=current PROMPT_VERSION.
// Failed rows, skipped rows, and completed rows on an older prompt
// version are eligible for re-analysis.

import { PROMPT_VERSION } from '../gemini/prompt'

export type ContentAnalysisRow = {
  status:         string | null
  prompt_version: string | null
}

export function isPendingForCurrentVersion(row: ContentAnalysisRow | undefined): boolean {
  if (row === undefined) return true
  return !(row.status === 'completed' && row.prompt_version === PROMPT_VERSION)
}
