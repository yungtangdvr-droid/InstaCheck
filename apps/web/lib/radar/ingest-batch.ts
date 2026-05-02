// Meme Radar — RSS ingest batch runner.
//
// Pure orchestration extracted from `scripts/radar/ingest.ts`:
// list active sources, fetch each feed, apply the cutoff, dedup within
// the feed, and persist via `ingestItem`. Per-source errors do not
// abort the run — they are recorded on `radar_sources.last_error` and
// surfaced in the per-source result.
//
// Callers (CLI script + manual refresh API route) are responsible for
// env validation, console output, automation_runs logging and exit
// codes. Mirrors the split between `scripts/radar/score.ts` and
// `lib/radar/score-batch.ts`.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

import { fetchRss } from './fetch-rss'
import { fingerprint } from './dedup'
import {
  ingestItem,
  listActiveSources,
  markSourceFetched,
  type RadarSourceRow,
} from './persist'

export const RADAR_INGEST_DEFAULT_AGE_DAYS = 7
export const RADAR_INGEST_AUTOMATION       = 'meme-radar-rss-ingest'

export interface RadarIngestPerSource {
  url:           string
  label:         string
  fetched:       number
  eligible:      number
  rawInserted:   number
  itemsInserted: number
  duplicates:    number
  skippedOld:    number
  error?:        string
}

export interface RadarIngestTotals {
  fetched:       number
  eligible:      number
  rawInserted:   number
  itemsInserted: number
  skippedOld:    number
  duplicates:    number
  errors:        number
}

export interface RadarIngestResult {
  ok:            boolean
  dryRun:        boolean
  cutoff:        string
  totalSources:  number
  totals:        RadarIngestTotals
  perSource:     RadarIngestPerSource[]
  durationMs:    number
  noOpReason:    string | null
}

export interface RunRadarIngestOptions {
  supabase:     SupabaseClient<Database>
  cutoff:       Date
  limit?:       number | null
  sourceFilter?: string | null
  dryRun?:      boolean
}

export function radarIngestDefaultCutoff(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() - RADAR_INGEST_DEFAULT_AGE_DAYS)
  return d
}

async function processSource(
  supabase: SupabaseClient<Database>,
  source:   RadarSourceRow,
  cutoff:   Date,
  limit:    number | null,
  dryRun:   boolean,
): Promise<RadarIngestPerSource> {
  const result: RadarIngestPerSource = {
    url:           source.url,
    label:         source.label,
    fetched:       0,
    eligible:      0,
    rawInserted:   0,
    itemsInserted: 0,
    duplicates:    0,
    skippedOld:    0,
  }

  let parsed
  try {
    parsed = await fetchRss(source.url)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch_failed'
    result.error = msg
    if (!dryRun) {
      try {
        await markSourceFetched(supabase, source.id, false, msg)
      } catch {
        // mark failure is non-fatal; surface only the original error.
      }
    }
    return result
  }

  result.fetched = parsed.items.length

  // Cutoff filter — items without a published_at are kept (we cannot
  // prove they are old). Dedup within a single feed by fingerprint to
  // mirror DB-level uniqueness.
  const seenFp = new Set<string>()
  const eligible = []
  for (const item of parsed.items) {
    if (item.publishedAt) {
      const t = Date.parse(item.publishedAt)
      if (Number.isFinite(t) && t < cutoff.getTime()) {
        result.skippedOld++
        continue
      }
    }
    const fp = fingerprint(item.title, item.url)
    if (seenFp.has(fp)) {
      result.duplicates++
      continue
    }
    seenFp.add(fp)
    eligible.push(item)
    if (limit && eligible.length >= limit) break
  }
  result.eligible = eligible.length

  if (dryRun) return result

  for (const item of eligible) {
    try {
      const r = await ingestItem(supabase, source.id, item)
      if (r.rawInserted)  result.rawInserted++
      if (r.itemInserted) result.itemsInserted++
      if (!r.itemInserted && !r.rawInserted) result.duplicates++
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ingest_item_failed'
      if (!result.error) result.error = msg
    }
  }

  try {
    await markSourceFetched(supabase, source.id, !result.error, result.error ?? null)
  } catch {
    // non-fatal
  }

  return result
}

export async function runRadarIngest(
  options: RunRadarIngestOptions,
): Promise<RadarIngestResult> {
  const { supabase, cutoff, limit = null, sourceFilter = null, dryRun = false } = options
  const start = Date.now()

  const sources = await listActiveSources(supabase, sourceFilter ?? undefined)

  if (sources.length === 0) {
    return {
      ok:           true,
      dryRun,
      cutoff:       cutoff.toISOString(),
      totalSources: 0,
      totals:       { fetched: 0, eligible: 0, rawInserted: 0, itemsInserted: 0, skippedOld: 0, duplicates: 0, errors: 0 },
      perSource:    [],
      durationMs:   Date.now() - start,
      noOpReason:   sourceFilter ? `no_active_source_matching:${sourceFilter}` : 'no_active_sources',
    }
  }

  const perSource: RadarIngestPerSource[] = []
  for (const source of sources) {
    const r = await processSource(supabase, source, cutoff, limit, dryRun)
    perSource.push(r)
  }

  const totals = perSource.reduce<RadarIngestTotals>(
    (acc, r) => {
      acc.fetched       += r.fetched
      acc.eligible      += r.eligible
      acc.rawInserted   += r.rawInserted
      acc.itemsInserted += r.itemsInserted
      acc.skippedOld    += r.skippedOld
      acc.duplicates    += r.duplicates
      if (r.error) acc.errors++
      return acc
    },
    { fetched: 0, eligible: 0, rawInserted: 0, itemsInserted: 0, skippedOld: 0, duplicates: 0, errors: 0 },
  )

  return {
    ok:           totals.errors === 0,
    dryRun,
    cutoff:       cutoff.toISOString(),
    totalSources: sources.length,
    totals,
    perSource,
    durationMs:   Date.now() - start,
    noOpReason:   null,
  }
}
