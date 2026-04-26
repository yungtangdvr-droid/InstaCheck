/* eslint-disable no-console */
//
// Benchmark probe — local CLI only.
//
// PR 2 scope: read-only probe of the official Meta Graph API
// for one external public IG Business / Creator username at a
// time. No DB writes, no HTTP route, no scheduled sync. Prints
// a single TBenchmarkProbeReport JSON object to stdout.
//
// Usage (from apps/web):
//   pnpm probe:benchmark -- --username=someaccount
//   pnpm probe:benchmark -- --username=someaccount --no-dry-run
//   pnpm probe:benchmark -- --help
//
// `--dry-run` is the default. In PR 2 there is nothing to write
// either way; the flag is reserved so that the PR that adds DB
// persistence can flip it without breaking existing usage.
//
// Required env: META_ACCESS_TOKEN, META_INSTAGRAM_ACCOUNT_ID.
// Missing env vars cause a clean structured-JSON exit with
// code 2; the script never invents credentials.

import { probeUsername } from '../../lib/meta/benchmark-probe'

type Cli = {
  username: string | null
  dryRun:   boolean
  help:     boolean
}

function parseArgv(argv: string[]): Cli {
  let username: string | null = null
  let dryRun = true
  let help = false
  for (const arg of argv.slice(2)) {
    if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg.startsWith('--username=')) {
      username = arg.slice('--username='.length).trim() || null
    } else if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--no-dry-run') {
      dryRun = false
    }
  }
  return { username, dryRun, help }
}

function printHelp() {
  const lines = [
    'probe-benchmark — local CLI probe of the official Meta Graph API',
    '',
    'Usage:',
    '  pnpm probe:benchmark -- --username=<ig_username> [--dry-run|--no-dry-run]',
    '',
    'Flags:',
    '  --username=<name>   external public IG Business / Creator username',
    '  --dry-run           default; reserved for future PR (no DB write in PR 2)',
    '  --no-dry-run        reserved for future PR (no DB write in PR 2)',
    '  --help, -h          show this message',
    '',
    'Required env:',
    '  META_ACCESS_TOKEN          long-lived Graph API token',
    '  META_INSTAGRAM_ACCOUNT_ID  operator ig-user-id (Business / Creator)',
    '',
    'Output: a single JSON object (TBenchmarkProbeReport) to stdout.',
  ]
  console.log(lines.join('\n'))
}

function failJson(payload: Record<string, unknown>, code: number): never {
  console.log(JSON.stringify(payload, null, 2))
  process.exit(code)
}

async function main() {
  const cli = parseArgv(process.argv)
  if (cli.help) {
    printHelp()
    process.exit(0)
  }

  if (!cli.username) {
    failJson(
      {
        ok:    false,
        error: 'missing_username',
        hint:  'pass --username=<ig_username>; run with --help for usage',
      },
      2
    )
  }

  const accessToken = process.env['META_ACCESS_TOKEN']
  const igUserId    = process.env['META_INSTAGRAM_ACCOUNT_ID']
  const missingEnv: string[] = []
  if (!accessToken) missingEnv.push('META_ACCESS_TOKEN')
  if (!igUserId)    missingEnv.push('META_INSTAGRAM_ACCOUNT_ID')

  if (missingEnv.length > 0) {
    failJson(
      {
        ok:          false,
        error:       'missing_env',
        missing_env: missingEnv,
        hint:        'export the required Meta Graph credentials before running',
      },
      2
    )
  }

  const report = await probeUsername({
    username:    cli.username!,
    igUserId:    igUserId!,
    accessToken: accessToken!,
  })

  console.log(JSON.stringify({ ok: true, dry_run: cli.dryRun, report }, null, 2))
  process.exit(0)
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  failJson({ ok: false, error: 'unexpected', message }, 1)
})
