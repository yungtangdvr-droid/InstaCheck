/* eslint-disable no-console */
//
// Meme Radar — RSS source seeder.
// Run from apps/web with: pnpm radar:seed-sources
//
// Reads ./seed-sources.json and idempotently upserts each entry into
// `radar_sources` keyed on the unique `url` column. Existing rows have
// their `label` / `language` refreshed; `active` is left untouched so
// the operator can manually disable a feed without it being re-armed
// here on every run.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'

import { upsertSource } from '../../lib/radar/persist'

interface SeedEntry {
  url:      string
  label:    string
  language: string | null
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

function loadSeed(): SeedEntry[] {
  const here = dirname(fileURLToPath(import.meta.url))
  const path = resolve(here, 'seed-sources.json')
  const raw  = readFileSync(path, 'utf8')
  const parsed = JSON.parse(raw) as Array<{ url: string; label: string; language?: string | null }>
  return parsed.map((p) => ({
    url:      p.url,
    label:    p.label,
    language: p.language ?? null,
  }))
}

async function main() {
  const env = readEnvOrFail()
  if ('error' in env) {
    console.error(`[radar:seed-sources] cannot run: ${env.error}`)
    process.exit(2)
  }
  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseKey)

  const seed = loadSeed()
  let inserted = 0
  let updated  = 0
  const failures: Array<{ url: string; error: string }> = []

  for (const entry of seed) {
    try {
      const res = await upsertSource(supabase, entry)
      if (res.inserted) inserted++
      else updated++
      console.log(`[radar:seed-sources] ${res.inserted ? 'inserted' : 'updated'} ${entry.url}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown_error'
      failures.push({ url: entry.url, error: msg })
      console.error(`[radar:seed-sources] failed ${entry.url}: ${msg}`)
    }
  }

  const ok = failures.length === 0
  console.log(JSON.stringify({
    ok,
    total:    seed.length,
    inserted,
    updated,
    failures,
  }, null, 2))
  if (!ok) process.exit(1)
}

main().catch((err) => {
  console.error('[radar:seed-sources] uncaught:', err)
  process.exit(1)
})
