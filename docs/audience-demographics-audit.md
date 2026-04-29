# Audience demographics — audit (PR4)

Status: **diagnostics only**. PR4 does not implement demographic
sync. This document captures the exact missing link so a follow-up PR
can be scoped without re-investigating the codebase.

Scope of audit:
- Path: `apps/web/app/(dashboard)/audience/page.tsx`
- Feature: `apps/web/features/audience/get-audience.ts`
- Meta sync: `apps/web/lib/meta/instagram-client.ts`, `sync-account.ts`,
  `sync-insights.ts`, `index.ts`
- Storage: `supabase/migrations/0001_initial.sql` … `0008_benchmark_cohort_peer_pool.sql`
- Types: `packages/types/index.ts`, `packages/types/supabase.ts`

## 1. Current UI state

`/audience` renders a section "Caractéristiques d'audience" with a
dashed-border empty state and the copy:

> Les données d'âge, de genre, de pays et de ville ne sont pas inférées
> depuis les posts. Elles viendront de l'insight officiel
> `follower_demographics` de l'API Meta lorsque la sync sera étendue.

Source: `apps/web/app/(dashboard)/audience/page.tsx:200-212`. The text is
fed by `audience.demographics.reason`.

The empty state is **honest** — it does not pretend the data is
filtering, throttling, or loading. It simply says no demographic
sync exists yet.

## 2. Current Meta sync state

`fetchAccount` in `apps/web/lib/meta/instagram-client.ts:40-49` requests:

```
fields=id,username,biography,followers_count,media_count,profile_picture_url
```

`MEDIA_INSIGHTS_METRICS` (line 12-19) covers media-level metrics only:
`reach, saved, shares, comments, likes, profile_visits`.

`fetchMediaInsights` queries `/{media-id}/insights` with those metrics.
There is no call against `/{ig-user-id}/insights` for audience-level
demographics anywhere in `lib/meta/`.

Verified by grep across `apps/web/lib`, `apps/web/features`,
`supabase/migrations`, `packages/types`:

```
grep -rn "demographic|follower_demographics|audience_demographics|audience_genders|audience_country|audience_city|audience_age"
```

→ zero matches outside this audit document and the audience page
empty-state copy referencing the Meta endpoint name.

## 3. Missing API call

The Meta Graph API endpoint that would provide the data is:

```
GET /{ig-user-id}/insights
    ?metric=follower_demographics
    &period=lifetime
    &metric_type=total_value
    &breakdown=country | city | age | gender
```

This call does **not** exist in the codebase. It must be added in a
new helper (proposed name: `fetchFollowerDemographics`) sitting next
to `fetchAccount` and `fetchMediaInsights`.

## 4. Missing storage table

No table stores audience demographics. None of the eight applied
migrations introduces a row for age / gender / country / city
breakdowns. The follow-up PR must add a new migration; current
candidate shape:

```sql
create table raw_instagram_audience_demographics (
  id              uuid primary key default gen_random_uuid(),
  account_id      text not null,
  date            date not null,
  breakdown       text not null,    -- 'country' | 'city' | 'age' | 'gender'
  key             text not null,    -- e.g. 'FR', 'Paris', '25-34', 'F'
  value           bigint not null,
  threshold_state text not null,    -- 'available' | 'available_below_threshold' | 'unavailable'
  fetched_via     text not null,
  raw_json        jsonb not null,
  synced_at       timestamptz not null default now(),
  unique (account_id, date, breakdown, key)
);
```

The `threshold_state` column is required — see §7.

## 5. Missing types

`packages/types/index.ts` does not declare an
`IGFollowerDemographicsResponse`, an `AudienceDemographicBreakdown`
union, or any helper type. `packages/types/supabase.ts` (generated)
does not contain a `raw_instagram_audience_demographics` table because
the table itself is missing.

The follow-up PR must:
1. Add hand-written types to `packages/types/index.ts` for the Meta
   response and the breakdown union.
2. Re-run `pnpm db:types` to regenerate `supabase.ts` after the
   migration lands.

## 6. Hardcoded unavailable state in `get-audience.ts`

`apps/web/features/audience/get-audience.ts:226-229`:

```ts
demographics: {
  available: false,
  reason:    'Données démographiques non encore synchronisées.',
},
```

This is the **single source** of the demographics empty state in the
UI. There is no read against any (non-existent) demographic table —
the field is literally hardcoded. The follow-up PR will replace this
block with a query against the new `raw_instagram_audience_demographics`
table and surface a third state (`available_below_threshold`).

## 7. Likely Meta threshold / availability caveats

Confirmed before the follow-up PR (treat as design constraints):

- `instagram_manage_insights` permission is required in addition to
  the current `instagram_basic`. The current Meta token may not have
  it — to be checked at runtime, with a graceful 403 fallback.
- Meta enforces a minimum-cohort threshold (~100 followers per
  breakdown axis) below which it returns no rows. The single-tenant
  account this hub serves likely sits above the threshold for the
  `country` and `gender` axes but may be below for `city` and `age`.
  The UI must distinguish:
  - `available` → render the chart.
  - `available_below_threshold` → empty state with copy explaining
    the Meta threshold (not the same as "not synced").
  - `unavailable` (4xx, missing scope, deprecated metric) → empty
    state with the API-side reason.
- Meta deprecated the legacy `audience_*` insight family (e.g.
  `audience_country`, `audience_city`, `audience_gender_age`) in
  Graph API v22. `follower_demographics` is the v22+ replacement and
  the only path that should be wired.
- The endpoint is **lifetime period** only; it returns a single
  snapshot per breakdown rather than a daily series. The follow-up
  PR's storage layout must therefore be one row per breakdown × key,
  upserted on (account_id, date, breakdown, key).

## 8. Proposed follow-up PR

Single follow-up PR (not started). Outline:

1. **Migration** `0009_audience_demographics.sql` — create
   `raw_instagram_audience_demographics` per §4 with the
   `threshold_state` column.
2. **Types** — add `IGFollowerDemographicsResponse` and breakdown
   unions to `packages/types/index.ts`. Regenerate `supabase.ts`.
3. **Meta client** — add `fetchFollowerDemographics({ igUserId,
   accessToken, breakdown })` to `lib/meta/instagram-client.ts`,
   matching the `fetchMediaInsights` retry pattern (graceful 4xx +
   missing-scope handling).
4. **Sync wiring** — call the new helper from the daily sync flow
   (`lib/meta/index.ts`) for each of the four breakdowns. On 403 or
   below-threshold, write a row with the appropriate
   `threshold_state` so the UI can distinguish the two empty cases.
5. **Read in feature** — replace the hardcoded `demographics` block
   in `features/audience/get-audience.ts` with a real query and
   surface the threshold state to the UI.
6. **UI** — extend `apps/web/app/(dashboard)/audience/page.tsx` to
   render the four breakdowns with three distinct empty-state
   variants (not-synced / below-threshold / unavailable).
7. **Validation** — `pnpm --filter web type-check`,
   `pnpm --filter web build`, smoke test against the live Meta
   account in dry-run mode before flipping the sync schedule.

PR4 does not perform any of the above. This document only records
the audit so the follow-up can be opened with full context.

## 9. Status: shipped in PR5

Implemented per outline above with the following PR5-specific
choices:

- Migration `0009_audience_demographics.sql` (mirrored at
  `packages/db/migrations/0006_audience_demographics.sql`) adds a
  `timeframe text not null` column to the candidate schema in §4.
  Unique key is `(account_id, date, timeframe, breakdown, key)`
  so future timeframes (`last_14_days`, `last_90_days`,
  `this_month`, …) can coexist without collision. PR5 wires
  `last_30_days` only.
- Meta call adds `metric_type=total_value` and
  `timeframe=last_30_days` to the params listed in §3.
- Sentinel `key='__meta_unavailable__'` (replaces the
  `__none__` proposal — clearer, less likely to be confused with
  a real demographic key).
- `runFullSync` now invokes `syncFollowerDemographics` after
  `syncInsightsForAllPosts` inside its own try/catch. One
  breakdown failing does not fail the whole sync; sentinel rows
  are persisted per failed breakdown. If all four 4xx, the sync
  still completes with `demographics.status='unavailable'`.
- `/audience` renders **four** UI states per breakdown
  (available, available_below_threshold, unavailable,
  not_synced) under the section title
  *"Démographie audience — 30 derniers jours"*. The legacy
  single empty-state block is removed.
- PR5 does not perform app review, scope upgrade, or token
  reauth. When the token is missing
  `instagram_manage_insights`, the unavailable copy explicitly
  hints at the missing scope so the operator can act.

---

_Superseded by `supabase/migrations/0009_audience_demographics.sql` (PR #48); the missing demographic sync described above has shipped._

