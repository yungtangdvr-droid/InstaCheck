/* eslint-disable no-console */
//
// Benchmark probe — local CLI.
//
// PR 2 introduced this script as a read-only probe of the official
// Meta Graph API. PR 3 adds opt-in DB persistence behind --persist.
// Dry-run remains the default; --no-dry-run is a no-op kept for
// backward compatibility (it never writes).
//
// Usage (from apps/web):
//   pnpm probe:benchmark -- --username=someaccount
//   pnpm probe:benchmark -- --username=@someaccount --persist --cohort=core_peer
//   pnpm probe:benchmark -- --help
//
// Validation order in --persist mode (so a missing-cohort or bad
// flag NEVER touches Meta or Supabase):
//   1. Flag-combination validation (no --persist + --dry-run).
//   2. --cohort value validation against the peer-pool enum.
//   3. Meta env vars present.
//   4. Supabase env vars present.
//   5. Look up benchmark_accounts by ig_username (normalized).
//      If the row is missing AND --cohort is missing, exit 2 with
//      error="missing_cohort" — NO Meta call, NO sync_runs row.
//   6. Insert benchmark_sync_runs with status='running'.
//   7. Call Meta Graph (probe).
//   8. Persist account / daily / media rows.
//   9. Update benchmark_sync_runs to success | partial | failed.
//
// Exit codes:
//   0 — CLI completed cleanly (including 'failed' runs and probe
//       errors with valid invocation).
//   1 — unexpected exception.
//   2 — invalid invocation (missing env, conflicting flags,
//       invalid cohort, missing cohort on first-time persist).
//
// Doctrine:
//   - The token is never printed, never embedded in errors, never
//     written to a row. All raw payloads pass through
//     scrubAccessToken.
//   - reposts is probed for availability only; never read as a
//     per-media value.

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@creator-hub/types/supabase'
import type {
  TBenchmarkCliWarning,
  TBenchmarkCohort,
} from '@creator-hub/types'

import { probeUsernameDetailed } from '../../lib/meta/benchmark-probe'
import {
  openSyncRun,
  persistProbeRun,
  preflightAccount,
} from '../../lib/meta/benchmark-persist'

const VALID_COHORTS = [
  'core_peer',
  'adjacent_culture',
  'french_francophone',
  'aspirational',
] as const satisfies readonly TBenchmarkCohort[]

type Cli = {
  rawUsername:        string | null
  username:           string | null
  cohort:             string | null
  persist:            boolean
  explicitDryRun:     boolean
  noDryRunFlag:       boolean
  help:               boolean
}

function normalizeUsername(raw: string): string {
  let u = raw.trim()
  if (u.startsWith('@')) u = u.slice(1)
  return u.toLowerCase()
}

function parseArgv(argv: string[]): Cli {
  let rawUsername: string | null = null
  let cohort:      string | null = null
  let persist        = false
  let explicitDryRun = false
  let noDryRunFlag   = false
  let help           = false

  for (const arg of argv.slice(2)) {
    if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg.startsWith('--username=')) {
      const v = arg.slice('--username='.length).trim()
      rawUsername = v.length > 0 ? v : null
    } else if (arg.startsWith('--cohort=')) {
      const v = arg.slice('--cohort='.length).trim()
      cohort = v.length > 0 ? v : null
    } else if (arg === '--persist') {
      persist = true
    } else if (arg === '--dry-run') {
      explicitDryRun = true
    } else if (arg === '--no-dry-run') {
      noDryRunFlag = true
    }
  }

  const username = rawUsername ? normalizeUsername(rawUsername) : null

  return {
    rawUsername,
    username,
    cohort,
    persist,
    explicitDryRun,
    noDryRunFlag,
    help,
  }
}

function printHelp() {
  const lines = [
    'probe-benchmark — local CLI probe of the official Meta Graph API',
    '',
    'Usage:',
    '  pnpm probe:benchmark -- --username=<ig_username>',
    '  pnpm probe:benchmark -- --username=<ig_username> --persist --cohort=<cohort>',
    '',
    'Flags:',
    '  --username=<name>   external public IG Business / Creator username',
    '                      (leading "@" stripped; trimmed; lowercased)',
    '  --persist           write probe results to Supabase. Requires',
    '                      NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    '                      Cannot be combined with --dry-run.',
    '  --cohort=<value>    peer-pool cohort. Required on first-time insert.',
    '                      One of: core_peer | adjacent_culture |',
    '                      french_francophone | aspirational.',
    '                      Ignored (with stdout warning) for an existing account.',
    '  --dry-run           default; no DB write.',
    '  --no-dry-run        deprecated no-op; use --persist for DB writes.',
    '  --help, -h          show this message',
    '',
    'Required env (always):',
    '  META_ACCESS_TOKEN          long-lived Graph API token',
    '  META_INSTAGRAM_ACCOUNT_ID  operator ig-user-id (Business / Creator)',
    '',
    'Required env (--persist only):',
    '  NEXT_PUBLIC_SUPABASE_URL',
    '  SUPABASE_SERVICE_ROLE_KEY',
    '',
    'Exit codes:',
    '  0  CLI completed cleanly (incl. failed runs with valid invocation)',
    '  1  unexpected exception',
    '  2  invalid invocation (missing env, conflicting flags,',
    '     invalid cohort, missing cohort on first-time --persist)',
    '',
    'Output: a single JSON object to stdout.',
  ]
  console.log(lines.join('\n'))
}

function emit(payload: Record<string, unknown>, code: number): never {
  console.log(JSON.stringify(payload, null, 2))
  process.exit(code)
}

function isValidCohort(v: string): v is TBenchmarkCohort {
  return (VALID_COHORTS as readonly string[]).includes(v)
}

async function main() {
  const cli = parseArgv(process.argv)

  if (cli.help) {
    printHelp()
    process.exit(0)
  }

  if (!cli.username) {
    emit(
      {
        ok:    false,
        error: 'missing_username',
        hint:  'pass --username=<ig_username>; run with --help for usage',
      },
      2
    )
  }

  // 1. Flag-combination validation. Persist + explicit dry-run is
  //    a contradiction. (Persist + default dry-run is fine — dry-run
  //    is the default value of a flag that wasn't typed.)
  if (cli.persist && cli.explicitDryRun) {
    emit(
      {
        ok:    false,
        error: 'conflicting_flags',
        hint:  '--persist cannot be combined with --dry-run',
      },
      2
    )
  }

  // 2. Cohort value validation, even when not in --persist mode,
  //    so that invalid cohort never silently passes earlier checks.
  if (cli.cohort !== null && !isValidCohort(cli.cohort)) {
    emit(
      {
        ok:             false,
        error:          'invalid_cohort',
        cohort:         cli.cohort,
        valid_cohorts:  VALID_COHORTS,
      },
      2
    )
  }

  // 3. Meta env always required.
  const accessToken = process.env['META_ACCESS_TOKEN']
  const igUserId    = process.env['META_INSTAGRAM_ACCOUNT_ID']
  const missingEnv: string[] = []
  if (!accessToken) missingEnv.push('META_ACCESS_TOKEN')
  if (!igUserId)    missingEnv.push('META_INSTAGRAM_ACCOUNT_ID')

  // 4. Supabase env required only when --persist.
  if (cli.persist) {
    if (!process.env['NEXT_PUBLIC_SUPABASE_URL']) {
      missingEnv.push('NEXT_PUBLIC_SUPABASE_URL')
    }
    if (!process.env['SUPABASE_SERVICE_ROLE_KEY']) {
      missingEnv.push('SUPABASE_SERVICE_ROLE_KEY')
    }
  }

  if (missingEnv.length > 0) {
    emit(
      {
        ok:          false,
        error:       'missing_env',
        missing_env: missingEnv,
        hint:        'export the required credentials before running',
      },
      2
    )
  }

  const warnings: TBenchmarkCliWarning[] = []
  if (cli.noDryRunFlag) {
    warnings.push({
      code:    'no_dry_run_deprecated',
      message: '--no-dry-run is a no-op; use --persist for DB writes',
    })
  }

  // ----- Dry-run path (default) -----------------------------------
  if (!cli.persist) {
    const detailed = await probeUsernameDetailed({
      username:    cli.username!,
      igUserId:    igUserId!,
      accessToken: accessToken!,
    })
    emit(
      {
        ok:       true,
        dry_run:  true,
        persist:  false,
        warnings,
        report:   detailed.report,
      },
      0
    )
  }

  // ----- Persist path --------------------------------------------
  const supabase = createClient<Database>(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } }
  )

  // 5. Pre-flight: does the account already exist?
  const preflight = await preflightAccount({
    supabase,
    igUsername: cli.username!,
  })

  if (!preflight.ok) {
    emit(
      {
        ok:    false,
        error: 'preflight_failed',
        hint:  preflight.error.message,
      },
      1
    )
  }

  let cohortForInsert: TBenchmarkCohort | null = null
  let existingAccountId: string | null = null

  if (preflight.exists) {
    existingAccountId = preflight.accountId
    if (cli.cohort !== null && cli.cohort !== preflight.cohort) {
      warnings.push({
        code:    'cohort_immutable_from_cli',
        message: 'cohort is immutable from the CLI; stored cohort kept',
        detail:  {
          requested: cli.cohort,
          stored:    preflight.cohort,
        },
      })
    }
  } else {
    // First-time username — cohort is REQUIRED. This must fail
    // BEFORE any Meta call and BEFORE inserting a sync_runs row.
    if (!cli.cohort) {
      emit(
        {
          ok:             false,
          error:          'missing_cohort',
          hint:           '--cohort is required on first-time insert',
          valid_cohorts:  VALID_COHORTS,
          username:       cli.username,
        },
        2
      )
    }
    cohortForInsert = cli.cohort as TBenchmarkCohort
  }

  // 6. Open the run row.
  const opened = await openSyncRun({ supabase })
  if (!opened.ok) {
    emit(
      {
        ok:    false,
        error: 'open_sync_run_failed',
        hint:  opened.error.message,
      },
      1
    )
  }

  // 7. Probe Meta.
  const detailed = await probeUsernameDetailed({
    username:    cli.username!,
    igUserId:    igUserId!,
    accessToken: accessToken!,
  })

  // 8 & 9. Persist + close run.
  const outcome = await persistProbeRun({
    supabase,
    igUsername:        cli.username!,
    detailed,
    cohort:            cohortForInsert,
    existingAccountId,
    runId:             opened.runId,
  })

  emit(
    {
      ok:           true,
      dry_run:      false,
      persist:      true,
      warnings,
      report:       detailed.report,
      persistence:  outcome.result,
    },
    0
  )
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  // Defensive scrub of the message just in case an upstream
  // library echoed a token-bearing URL into the error string.
  const safe = message.replace(/access_token=[^&\s"'<>]*/gi, 'access_token=REDACTED')
  emit({ ok: false, error: 'unexpected', message: safe }, 1)
})
