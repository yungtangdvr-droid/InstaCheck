# Benchmark persist CLI — live validation log

PR3 added opt-in DB persistence to the local benchmark probe CLI behind
the `--persist` flag. This document records the live validation runs
performed against a Supabase instance with a regenerated Meta token.

No tokens, no service-role keys, and no Meta IDs appear in this file.
The previously exposed Meta token has been revoked/regenerated outside
the repository.

All commands below were run from the repo root.

---

## 1. Happy path

**Command**

```
pnpm -F web probe:benchmark -- --username=@Instagram --persist --cohort=core_peer
```

**Observed behavior**

- Username normalized from `@Instagram` to `instagram` before any DB
  lookup or Meta call (trim, strip leading `@`, lowercase).
- `benchmark_accounts` row created with `ig_username = instagram` and
  `cohort = core_peer`.
- One `raw_benchmark_instagram_account_daily` row written for the run's
  UTC date with numeric `followers_count` and `media_count`.
- 5 `raw_benchmark_instagram_media` rows written.
- `benchmark_sync_runs` row closed with `status = success`,
  `accounts_succeeded = 1`, `media_fetched = 5`.
- `reposts` returned `unavailable_field` from the probe; this did not
  demote the run status. Doctrine: reposts unavailable alone is still
  `success`.

---

## 2. Idempotency

**Command**

```
pnpm -F web probe:benchmark -- --username=instagram --persist --cohort=core_peer
```

**Observed behavior**

- Pre-flight matched the existing `benchmark_accounts` row. No new
  account row created.
- Stdout `persistence.account_inserted = false`.
- `raw_benchmark_instagram_account_daily` upserted on
  `(benchmark_account_id, date)` — same row, `synced_at` advanced. No
  duplicate created.
- `raw_benchmark_instagram_media` upserted on
  `(benchmark_account_id, media_id)` — existing rows refreshed, no
  duplicates created.
- One additional `benchmark_sync_runs` row created (one run row per CLI
  execution, by design).

---

## 3. Cohort immutability

**Command**

```
pnpm -F web probe:benchmark -- --username=instagram --persist --cohort=aspirational
```

**Observed behavior**

- Stored cohort remained `core_peer` in `benchmark_accounts`. The CLI
  never mutates a cohort once stored.
- Stdout `warnings[]` contained an entry with
  `code = "cohort_immutable_from_cli"`, including the requested
  (`aspirational`) and stored (`core_peer`) values in `detail`.
- Run status remained `success` — cohort divergence is non-fatal and
  reported as a warning only.

---

## 4. Failed username

**Command**

```
pnpm -F web probe:benchmark -- --username=this_user_should_not_exist_999999 --persist --cohort=core_peer
```

**Observed behavior**

- Pre-flight returned `exists: false`; cohort was supplied, so the run
  proceeded.
- One `benchmark_sync_runs` row created with `status = running`, then
  closed to `status = failed` after Business Discovery returned a
  Meta 400 invalid-user response.
- No `benchmark_accounts` row created.
- No `raw_benchmark_instagram_account_daily` row created.
- No `raw_benchmark_instagram_media` rows created.
- Stdout was structured JSON whose `report.errors[]` carried the
  Meta 400 invalid-user error, and `persistence.status = failed`.
- Exit code 0 (CLI completed cleanly with structured output).

---

## 5. Missing cohort on first-time persist

**Command**

```
pnpm -F web probe:benchmark -- --username=some_new_real_username --persist
```

**Observed behavior**

- Validation order enforced: flags → cohort value → Meta env → Supabase
  env → preflight. With pre-flight returning `exists: false` and
  `--cohort` absent, the CLI exited at the pre-flight gate.
- Exit code 2.
- Structured stdout JSON with `error = "missing_cohort"`, the valid
  cohort list, and the normalized username echoed.
- No `benchmark_sync_runs` row created — the CLI fails before the run
  row is opened, so this case is not recorded as a failed sync. It is
  treated as an operator input error.
- No `benchmark_accounts`, `raw_benchmark_instagram_account_daily`, or
  `raw_benchmark_instagram_media` rows created.

---

## 6. DB verification

After the four runs that successfully reached persistence (cases 1, 2,
3, and 4):

- `benchmark_accounts` — exactly one row.

  | ig_username | cohort     |
  | ----------- | ---------- |
  | instagram   | core_peer  |

- `benchmark_sync_runs` — three rows with `status = success` (cases 1,
  2, 3) plus one row with `status = failed` (case 4). Case 5 produced
  no run row, as required.
- `raw_benchmark_instagram_account_daily` — one row for `instagram`
  with numeric `followers_count` and `media_count` for today's UTC
  date.
- `raw_benchmark_instagram_media` — five rows for `instagram` with
  numeric `like_count`, `comments_count`, and `view_count`.
- `reposts` column on every media row remained `NULL`. The probe
  checks reposts availability only and never reads a per-media value
  into this column.
- Every persisted `metric_availability.reposts` value was
  `unavailable_field`, matching the live probe verdict.

---

## 7. Secret scrub

Three queries were run against the persisted rows to confirm no
`access_token` substring leaked through `raw_json` or `errors`:

- account_raw_token_hits = 0
- media_raw_token_hits = 0
- run_error_token_hits = 0

The recursive sanitizer in `apps/web/lib/meta/benchmark-sanitize.ts`
both drops object keys named `access_token` and rewrites
`access_token=...` query substrings to `access_token=REDACTED`. It is
applied to every `raw_json` write, the probe's
`raw_response_excerpt`, and every `errors[].body` entry on
`benchmark_sync_runs`.

---

## 8. Product conclusion

- Benchmark v1 can persist five public Meta Graph metrics:
  `followers_count`, `media_count`, `like_count`, `comments_count`, and
  `view_count`.
- Benchmark v1 does not use `reposts` for scoring. Reposts remain
  nullable on `raw_benchmark_instagram_media` and are recorded only in
  `metric_availability` for transparency. Any future scoring change
  must continue to treat reposts as optional.
- The CLI is the only writer of these tables in PR3. There is still no
  HTTP route, no scheduled sync, no n8n workflow, no dbt mart, and no
  peer-percentile computation associated with this scope.
