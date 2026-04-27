// Benchmark probe — pure logic, no I/O of its own beyond what
// the injected client performs. Produces a TBenchmarkProbeReport
// describing which official Meta Graph API fields are available
// for a given external public IG Business / Creator account.
//
// Scope discipline (PR 2):
//   - Probes ONLY: followers_count, media_count, like_count,
//     comments_count, view_count, reposts.
//   - Forbidden, never queried: reach, saves, shares,
//     profile_visits, audience demographics, any inferred or
//     private metric.
//   - Reposts are nullable and never assumed available. We try
//     a known candidate field name; if the API rejects it or
//     returns it absent, the metric is recorded as
//     unavailable_field / unavailable_400 / unavailable_403 /
//     unavailable_other.

import type {
  TBenchmarkAccountFieldKey,
  TBenchmarkMediaFieldKey,
  TBenchmarkMetricStatus,
  TBenchmarkProbeError,
  TBenchmarkProbeReport,
} from '@creator-hub/types'

import {
  fetchBusinessDiscovery,
  probeMediaField,
  type BenchmarkApiError,
  type BenchmarkApiResult,
  type BusinessDiscoveryAccount,
  type BusinessDiscoveryEnvelope,
  type BusinessDiscoveryMedia,
} from './benchmark-public-client'
import { scrubAccessToken } from './benchmark-sanitize'

// Repost candidate field names on Instagram media via Business
// Discovery. We only ask for the canonical `reposts` name. Any
// other candidate (e.g. `reshare_count`, `share_count`) would
// either be an owner-side engagement metric (forbidden for peers)
// or lack a Meta-documented public repost citation. If `reposts`
// is absent from the response or the API rejects it, the metric
// is recorded as unavailable_* — never assumed.
const REPOST_FIELD_CANDIDATES = ['reposts'] as const

export type BenchmarkProbeDeps = {
  fetchBusinessDiscovery: typeof fetchBusinessDiscovery
  probeMediaField:        typeof probeMediaField
}

const DEFAULT_DEPS: BenchmarkProbeDeps = {
  fetchBusinessDiscovery,
  probeMediaField,
}

export type ProbeUsernameArgs = {
  username:    string
  igUserId:    string
  accessToken: string
}

// Detailed result variant — used by the persistence layer in PR 3
// so it can write account- and media-level rows without re-fetching
// the Business Discovery payload. The public stdout JSON shape on
// the dry-run path keeps using `TBenchmarkProbeReport` only.
export type BenchmarkProbeDetailed = {
  report:  TBenchmarkProbeReport
  account: BusinessDiscoveryAccount | null
  media:   BusinessDiscoveryMedia[]
}

function classifyApiError(err: BenchmarkApiError): TBenchmarkMetricStatus {
  if (err.status === 400) return 'unavailable_400'
  if (err.status === 403) return 'unavailable_403'
  return 'unavailable_other'
}

function toReportError(
  field: string | undefined,
  err: BenchmarkApiError
): TBenchmarkProbeError {
  return {
    ...(field ? { field } : {}),
    status:  err.status,
    message: err.message,
  }
}

function statusFromValue(value: unknown): TBenchmarkMetricStatus {
  return value === undefined || value === null
    ? 'unavailable_field'
    : 'available'
}

function pickFirstMedia(
  account: BusinessDiscoveryAccount | undefined
): Record<string, unknown> | null {
  const list = account?.media?.data
  if (!Array.isArray(list) || list.length === 0) return null
  return list[0] as Record<string, unknown>
}

async function probeRepostsField(args: {
  username:     string
  igUserId:     string
  accessToken:  string
  deps:         BenchmarkProbeDeps
  errors:       TBenchmarkProbeError[]
}): Promise<TBenchmarkMetricStatus> {
  let lastErrorStatus: TBenchmarkMetricStatus = 'unavailable_field'

  for (const field of REPOST_FIELD_CANDIDATES) {
    const res: BenchmarkApiResult<BusinessDiscoveryEnvelope> =
      await args.deps.probeMediaField({
        igUserId:       args.igUserId,
        targetUsername: args.username,
        accessToken:    args.accessToken,
        fieldName:      field,
      })

    if (!res.ok) {
      args.errors.push(toReportError(field, res.error))
      lastErrorStatus = classifyApiError(res.error)
      continue
    }

    const media = pickFirstMedia(res.data.business_discovery)
    if (media && media[field] !== undefined && media[field] !== null) {
      return 'available'
    }
    // Field accepted by the API but returned absent — keep
    // searching candidates; default remains unavailable_field.
  }

  return lastErrorStatus
}

export async function probeUsernameDetailed(
  args: ProbeUsernameArgs,
  deps: BenchmarkProbeDeps = DEFAULT_DEPS
): Promise<BenchmarkProbeDetailed> {
  const errors: TBenchmarkProbeError[] = []

  const accountFields: Record<TBenchmarkAccountFieldKey, TBenchmarkMetricStatus> = {
    followers_count: 'unavailable_field',
    media_count:     'unavailable_field',
  }
  const mediaFields: Record<TBenchmarkMediaFieldKey, TBenchmarkMetricStatus> = {
    like_count:     'unavailable_field',
    comments_count: 'unavailable_field',
    view_count:     'unavailable_field',
    reposts:        'unavailable_field',
  }

  const main = await deps.fetchBusinessDiscovery({
    igUserId:       args.igUserId,
    targetUsername: args.username,
    accessToken:    args.accessToken,
    mediaLimit:     5,
  })

  if (!main.ok) {
    errors.push(toReportError(undefined, main.error))
    const status = classifyApiError(main.error)
    accountFields.followers_count = status
    accountFields.media_count     = status
    mediaFields.like_count        = status
    mediaFields.comments_count    = status
    mediaFields.view_count        = status
    mediaFields.reposts           = status
    return {
      report: {
        username:             args.username,
        ig_user_id:           null,
        fetched_via:          null,
        account_fields:       accountFields,
        media_fields:         mediaFields,
        sample_media_count:   0,
        errors,
        raw_response_excerpt: scrubAccessToken(main.error.body),
      },
      account: null,
      media:   [],
    }
  }

  const account = main.data.business_discovery ?? null
  const mediaList = account?.media?.data ?? []
  const firstMedia = pickFirstMedia(account ?? undefined)

  accountFields.followers_count = statusFromValue(account?.followers_count)
  accountFields.media_count     = statusFromValue(account?.media_count)

  if (firstMedia) {
    mediaFields.like_count     = statusFromValue(firstMedia['like_count'])
    mediaFields.comments_count = statusFromValue(firstMedia['comments_count'])
    mediaFields.view_count     = statusFromValue(firstMedia['view_count'])
  }

  // Reposts: only probe further if Business Discovery itself
  // worked. If we have no sample media at all, repost probing
  // is meaningless — leave it unavailable_field.
  if (firstMedia) {
    mediaFields.reposts = await probeRepostsField({
      username:    args.username,
      igUserId:    args.igUserId,
      accessToken: args.accessToken,
      deps,
      errors,
    })
  }

  return {
    report: {
      username:             args.username,
      ig_user_id:           account?.id ?? null,
      fetched_via:          'business_discovery',
      account_fields:       accountFields,
      media_fields:         mediaFields,
      sample_media_count:   mediaList.length,
      errors,
      raw_response_excerpt: redactExcerpt(main.data),
    },
    account,
    media: mediaList,
  }
}

export async function probeUsername(
  args: ProbeUsernameArgs,
  deps: BenchmarkProbeDeps = DEFAULT_DEPS
): Promise<TBenchmarkProbeReport> {
  const detailed = await probeUsernameDetailed(args, deps)
  return detailed.report
}

// Trim the excerpt so stdout JSON stays small and we don't
// accidentally surface long permalinks or thumbnail URLs in
// logs. We keep only top-level keys + first 2 media items, and
// route everything through the access-token scrubber.
function redactExcerpt(envelope: BusinessDiscoveryEnvelope): unknown {
  const account = envelope.business_discovery
  if (!account) return scrubAccessToken(envelope)
  return scrubAccessToken({
    business_discovery: {
      username:        account.username,
      id:              account.id,
      followers_count: account.followers_count,
      media_count:     account.media_count,
      media: account.media
        ? {
            data: (account.media.data ?? []).slice(0, 2),
          }
        : undefined,
    },
  })
}
