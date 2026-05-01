/* eslint-disable no-console */
//
// Meme Radar — image_url backfill CLI.
// Run from apps/web with:
//   pnpm radar:backfill-images -- --dry-run
//   pnpm radar:backfill-images
//   pnpm radar:backfill-images -- --limit=500
//
// Behavior:
//   - Reads raw_radar_items rows where image_url is null and raw_json
//     is not null, paginated.
//   - Re-runs the same TS image picker used by ingest
//     (`pickImageUrlFromRawJson`) — including the new HTML <img>
//     fallback over content / content:encoded / description / summary
//     / contentSnippet — and writes the recovered URL onto the row.
//   - Propagates the freshly populated image_url onto the matching
//     radar_items row (only when its image_url is still null).
//   - --dry-run reports per-source recovery counts and writes nothing.
//
// No remote provider calls. No destructive operations.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@creator-hub/types/supabase'

import { pickImageUrlFromRawJson } from '../../lib/radar/fetch-rss'
import { asRadarClient } from '../../lib/radar/persist'

const PAGE_SIZE = 500

type Cli = {
  dryRun: boolean
  limit:  number | null
}

function parseArgv(argv: string[]): Cli {
  let dryRun = false
  let limit: number | null = null
  const args = argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--dry-run') {
      dryRun = true
    } else if (arg.startsWith('--limit=')) {
      const n = Number.parseInt(arg.slice('--limit='.length), 10)
      if (Number.isFinite(n) && n > 0) limit = n
    } else if (arg === '--limit' && i + 1 < args.length) {
      const n = Number.parseInt(args[++i]!, 10)
      if (Number.isFinite(n) && n > 0) limit = n
    }
  }
  return { dryRun, limit }
}

function readEnvOrFail(): { supabaseUrl: string; supabaseKey: string } | { error: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const missing: string[] = []
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length) return { error: `missing_env:${missing.join(',')}` }
  return { supabaseUrl: supabaseUrl!, supabaseKey: supabaseKey! }
}

interface RawCandidate {
  id:        string
  source_id: string
  raw_json:  Json | null
}

async function fetchPage(
  client: SupabaseClient<Database>,
  offset: number,
  pageSize: number,
): Promise<RawCandidate[]> {
  const radar = asRadarClient(client)
  const { data, error } = await radar
    .from('raw_radar_items')
    .select('id,source_id,raw_json')
    .is('image_url', null)
    .not('raw_json', 'is', null)
    .order('fetched_at', { ascending: true })
    .range(offset, offset + pageSize - 1)
  if (error) throw new Error(`raw_select_failed: ${error.message}`)
  return (data ?? []) as RawCandidate[]
}

async function loadSourceLabels(
  client: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const radar = asRadarClient(client)
  const { data, error } = await radar
    .from('radar_sources')
    .select('id,label')
    .in('id', ids)
  if (error) throw new Error(`source_lookup_failed: ${error.message}`)
  return new Map((data ?? []).map((s) => [s.id, s.label]))
}

interface PerSourceCount {
  scanned:   number
  recovered: number
}

function ensureBucket(map: Map<string, PerSourceCount>, key: string): PerSourceCount {
  let bucket = map.get(key)
  if (!bucket) {
    bucket = { scanned: 0, recovered: 0 }
    map.set(key, bucket)
  }
  return bucket
}

async function main() {
  const cli = parseArgv(process.argv)
  const env = readEnvOrFail()
  if ('error' in env) {
    console.error(`[radar:backfill-images] cannot run: ${env.error}`)
    process.exit(2)
  }

  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseKey)
  const startedAt = Date.now()

  const perSource = new Map<string, PerSourceCount>()
  let totalScanned   = 0
  let totalRecovered = 0
  let rawUpdated     = 0
  let radarUpdated   = 0

  // Page through raw rows missing image_url. We never re-fetch the
  // same row in a single run (offset only moves forward, and we
  // update rows in-place so the next page's filter naturally excludes
  // them — but using offset is safer if dryRun keeps them visible).
  let offset = 0
  while (true) {
    const remaining = cli.limit != null ? cli.limit - totalScanned : Number.POSITIVE_INFINITY
    if (remaining <= 0) break
    const pageSize = Math.min(PAGE_SIZE, remaining)
    const page = await fetchPage(supabase, cli.dryRun ? offset : 0, pageSize)
    if (page.length === 0) break

    for (const row of page) {
      totalScanned++
      const bucket = ensureBucket(perSource, row.source_id)
      bucket.scanned++

      const rawJson = row.raw_json
      if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) continue

      const recovered = pickImageUrlFromRawJson(rawJson as Record<string, unknown>)
      if (!recovered) continue

      totalRecovered++
      bucket.recovered++

      if (cli.dryRun) continue

      const radar = asRadarClient(supabase)

      const { error: rawErr } = await radar
        .from('raw_radar_items')
        .update({ image_url: recovered })
        .eq('id', row.id)
        .is('image_url', null)
      if (rawErr) {
        console.error(`[radar:backfill-images] raw_update_failed for ${row.id}: ${rawErr.message}`)
        continue
      }
      rawUpdated++

      const { error: itemErr, count } = await radar
        .from('radar_items')
        .update({ image_url: recovered }, { count: 'exact' })
        .eq('raw_item_id', row.id)
        .is('image_url', null)
      if (itemErr) {
        console.error(`[radar:backfill-images] item_update_failed for raw=${row.id}: ${itemErr.message}`)
        continue
      }
      if (typeof count === 'number') radarUpdated += count
    }

    if (cli.dryRun) {
      offset += page.length
    }
    if (page.length < pageSize) break
  }

  const sourceLabels = await loadSourceLabels(supabase, [...perSource.keys()])
  const perSourceReport = [...perSource.entries()]
    .map(([id, c]) => ({
      source_id: id,
      label:     sourceLabels.get(id) ?? null,
      scanned:   c.scanned,
      recovered: c.recovered,
    }))
    .sort((a, b) => b.recovered - a.recovered)

  const summary = {
    ok:           true,
    dryRun:       cli.dryRun,
    totalScanned,
    totalRecovered,
    rawUpdated,
    radarUpdated,
    perSource:    perSourceReport,
    durationMs:   Date.now() - startedAt,
  }
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((err) => {
  console.error('[radar:backfill-images] uncaught:', err)
  process.exit(1)
})
