# Archive ingestion runbook (V1)

V1 of the Archive Pattern Library is a **metadata-only** backfill of the
Instagram archive (~28 K posts) for a single operator account. It is
manually triggered, resumable, and intentionally minimal: no insights,
no AI, no embeddings, no cron.

Source files:

- migration: `supabase/migrations/0014_archive_ingestion_state.sql`
- core:      `apps/web/lib/meta/archive-backfill.ts`
- helpers:   `apps/web/lib/meta/rate-limit.ts`
- queries:   `apps/web/lib/meta/queries/archive-status.ts`
- endpoint:  `apps/web/app/api/meta/archive/backfill/route.ts`
- page:      `apps/web/app/(dashboard)/content-lab/archive/page.tsx`

## Schema

Two new tables, both single-tenant `authenticated_full_access` RLS:

- `post_archive_state` (1 row per `posts.id`):
  - `metadata_status` — default `imported`. Allowed: `imported`,
    `reimport_needed`, `error`. **Only axis written by V1.**
  - `metrics_status` — default `not_requested`. Allowed: `not_requested`,
    `queued`, `synced`, `error`, `skipped`. Future use.
  - `embedding_status` — default `not_started`. Allowed: `not_started`,
    `queued`, `done`, `error`, `skipped`. Future use.
  - `ai_tagging_status` — default `not_started`. Allowed: `not_started`,
    `queued`, `tagged`, `error`, `skipped`. Future use.
  - `human_review_status` — default `pending`. Allowed: `pending`,
    `approved`, `rejected`. Future use.
  - `pattern_status` — default `pending`. Allowed: `pending`, `linked`,
    `excluded`. Future use.
  - `archive_priority`, `last_indexed_at`, `last_error`,
    `created_at`, `updated_at`.
- `ingestion_cursors` (generic, keyed by `job_name`):
  - `cursor`, `last_processed_media_id`, `status`,
    `fetched_count`, `upserted_count`, `skipped_count`,
    `error_count`, `started_at`, `ran_at`, `finished_at`,
    `last_error`, `payload`.

Future axes deliberately default to `not_requested` / `not_started` /
`pending`, never `queued`, so a row's presence never implies queued
work for a non-existent worker.

## Endpoint

`POST /api/meta/archive/backfill`

- Auth: `Authorization: Bearer $N8N_API_KEY` (same env var as
  `/api/meta/sync`). No new env var.
- Query/body params:
  - `pageBudget` — pages per invocation (default 5, min 1, max 10).
  - `timeBudgetMs` — wall-clock budget per invocation (default 60 000,
    min 1 000, max 90 000).
- Behavior per call:
  1. Resolves `accounts.id` for `META_INSTAGRAM_ACCOUNT_ID` (errors if
     `/api/meta/sync` has not run at least once).
  2. Loads / creates the cursor row `meta.media.archive_backfill`.
     Returns early if already `running` or `complete`.
  3. Marks `running`, then loops:
     - `fetchMediaPage(after)` with exponential backoff (1 → 2 → 4 → 8 s,
       max 4 retries; 4xx other than 429 short-circuit).
     - For each item: upsert `raw_instagram_media`, upsert/insert
       `posts`, upsert `post_archive_state` with
       `metadata_status='imported'`, `last_indexed_at=now()`.
     - After the page commits, persist `cursor` + counters in one
       update on `ingestion_cursors`.
     - Sleep 250 ms between pages.
     - Exit when page budget hit, time budget hit, or
       `paging.next` is absent (cursor row → `complete`,
       `finished_at` set).
- Logs each invocation in `automation_runs` with
  `automation_name='meta.archive.backfill'`.

V1 never calls `/insights`, `/follower_demographics`, or any AI / vision
service.

## Smoke test

Prerequisite: `/api/meta/sync` has run successfully at least once
(populates `accounts`).

1. From a workstation:
   ```bash
   curl -X POST 'https://<host>/api/meta/archive/backfill?pageBudget=1' \
        -H "Authorization: Bearer $N8N_API_KEY"
   ```
2. Expect HTTP 200 and a JSON body with:
   - `result.startedThisRun = true`
   - `result.pagesThisRun = 1`
   - `result.fetchedThisRun ≤ 50`
   - `result.upsertedThisRun + result.skippedThisRun ===
     result.fetchedThisRun`
   - `result.cursor` non-null (unless the archive is < 50 posts, in
     which case `result.reachedEndOfArchive = true` and
     `result.status = 'complete'`).
3. Verify in Supabase:
   - `select count(*) from post_archive_state` increased by the
     fetched count.
   - `select * from ingestion_cursors where job_name =
     'meta.media.archive_backfill'` shows `status='idle'` (or
     `'complete'`) and the new cursor.
   - `select count(*) from raw_instagram_media_insights` did **not**
     change.
4. Repeat with the same call. Expected:
   - `fetched_count` increases by the new page size.
   - `posts` row count does not change (idempotent on `media_id`).
   - `post_archive_state.last_indexed_at` advances for already-known
     `post_id`s.

## Rollback

This repo has no down-migration convention. To roll back V1:

```sql
drop trigger if exists post_archive_state_set_updated_at on post_archive_state;
drop trigger if exists ingestion_cursors_set_updated_at  on ingestion_cursors;
drop table   if exists post_archive_state;
drop table   if exists ingestion_cursors;
```

Then revert the application files listed at the top of this runbook.
No data loss is possible from rolling back: V1 only writes to the two
new tables; `posts` and `raw_instagram_media` upserts already happen
via the existing live sync path.

## Out of scope (do not extend without a new manager decision)

- Insights / metrics backfill.
- AI tagging worker.
- Embeddings.
- Image analysis / OCR / vision.
- Cron registration.
- Changes to `/api/meta/sync` or `/api/meta/sync-now`.
- Schema changes to `posts`, `raw_instagram_media`,
  `raw_instagram_media_insights`, `post_metrics_daily`, `post_tags`,
  `content_themes`, `content_recommendations`.
