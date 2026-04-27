# Benchmark probe validation — PR 2 follow-up

Date: 2026-04-26 (updated 2026-04-27 with live probe results)
Branch: `claude/benchmark-types-live-probe-sIYsA` (harness-pinned;
the requested name `chore/benchmark-types-and-live-probe` could not
be used because the harness rules pin this session to the branch
above)
Base: `origin/main` @ `4e3a0e8` (`feat: add benchmark discovery
foundation`).

## TL;DR

PR 2's external-benchmark caveat is closed:

- Migration `0007_benchmark_foundation.sql` applies cleanly on a
  fresh local DB (after the `0004_mart_views.sql` guard fix in this
  branch).
- `packages/types/supabase.ts` has been regenerated and exposes the
  six PR 2 symbols (`benchmark_accounts`,
  `raw_benchmark_instagram_account_daily`,
  `raw_benchmark_instagram_media`, `benchmark_sync_runs`,
  `benchmark_cohort`, `benchmark_metric_status`).
- The Meta Graph probe was run against one real public IG Business /
  Creator handle and one obviously fake one. Both behaved correctly
  and recorded the per-metric availability we needed.

PR 3 (DB persistence) can now start.

## 1. Migration chain

`supabase/migrations/0001…0007.sql` apply in order on a fresh DB.
The blocker was `0004_mart_views.sql` forwarding `public.v_mart_*`
from `marts.mart_*` tables that don't exist before dbt has run; that
file now wraps each `create / grant` pair in a `do $$ … end $$;` block
guarded by `to_regclass('marts.<table>')`. End-state in production is
unchanged. See commit `7cda2f7` on this branch.

## 2. Type regeneration

`packages/types/supabase.ts` was regenerated using the official
Supabase CLI after the migration chain applied successfully. The
file now uses the canonical `Database['public']['Tables'][...]['Row'
| 'Insert' | 'Update']` and `Database['public']['Enums'][...]`
shape (replacing the previous hand-maintained loose wrapper), and
includes all six benchmark symbols. The regeneration also surfaced
four pre-existing schema/code mismatches that are addressed in the
companion code patches in this PR (see `apps/web` changes).

## 3. Live probe — real public IG username

Real username tested: `instagram`

Result:

- `followers_count`: available
- `media_count`: available
- `like_count`: available
- `comments_count`: available
- `view_count`: available
- `reposts`: unavailable_field

Conclusion:
Business Discovery can support a public benchmark based on followers,
media count, likes, comments and views. Reposts are not currently
available through the tested official field and must remain
nullable / excluded from benchmark scoring. The DB column
`raw_benchmark_instagram_media.reposts` is already nullable in
`0007_benchmark_foundation.sql`, and the probe records this status
in `metric_availability` via the `benchmark_metric_status` enum, so
no schema or scoring change is required.

## 4. Live probe — fake username

Fake username tested: `this_user_should_not_exist_999999`

Result:

- API returned 400 / invalid user id.
- All account and media fields classified as `unavailable_400`.
- Error handling behaved as expected: structured `TBenchmarkProbeReport`
  output with the classified status and the raw error captured in
  `errors`, exit code 0 from the CLI (the unknown username is a
  business outcome, not a process failure).

## 5. Reposts availability — confirmed unavailable today

Result of §3 above: the canonical `reposts` field on
`business_discovery.media{}` is reported as `unavailable_field`
against a known good public account. Treat reposts as unavailable
in PR 3:

- keep `raw_benchmark_instagram_media.reposts` nullable on insert,
- do not include reposts in any benchmark-derived score until the
  field becomes available on the official API.

## 6. Type-check / build

Both green on this branch.

## 7. Required env

The probe requires the operator's existing Meta Graph credentials —
the long-lived Graph token and the operator's IG Business / Creator
account id. **No values are recorded in this document or in any
commit.** The exact variable names live in `.env.example` and in the
probe's `--help` output; neither is reproduced here. If a token was
ever pasted into chat, terminal scrollback, CI logs, or any other
artifact, rotate it through the Meta App dashboard regardless of
whether it appears in this repository.

## 8. Files touched in this PR

- `supabase/migrations/0004_mart_views.sql` — guard `public.v_mart_*`
  forwards behind `to_regclass()` so fresh `db reset` succeeds.
- `packages/types/supabase.ts` — regenerated via `pnpm db:types`
  (no hand edits).
- `apps/web/app/api/automations/stale-opportunities/route.ts` —
  type `OPEN_STAGES` against the `deal_stage` enum and drop the
  `as unknown as string[]` cast.
- `apps/web/app/api/webhooks/changedetection/route.ts` — fall back
  to `''` (empty string) instead of `null` for `change_summary`,
  matching the `text not null` column.
- `apps/web/features/crm/actions.ts` — require `contactId` on
  `createTouchpoint` so `touchpoints.contact_id` (`uuid not null`)
  is never inserted as `null`.
- `apps/web/lib/meta/sync-media.ts` — add `normalizeMediaType`
  mapping Meta `REEL` → DB `VIDEO` (and `STORY` → `IMAGE` for
  exhaustiveness; `/me/media` does not return stories) before
  upsert / insert.
- `docs/benchmark-probe-validation.md` — this document.

No benchmark probe code was touched. No DB persistence wired. No UI,
HTTP route, n8n, dbt, or scoring change. No manual edits to
`packages/types/supabase.ts`.

## 9. Can PR 3 start?

**Yes.** All three blockers are now closed:

1. Migration chain applies cleanly on fresh local DB.
2. `packages/types/supabase.ts` includes the benchmark symbols.
3. Live probe confirmed which fields are available and which are not,
   so PR 3's persistence layer can write `raw_benchmark_instagram_*`
   with confidence in what to expect for `reposts`.
