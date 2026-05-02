-- ============================================================
-- Creator Hub — Migration 0014 : Archive ingestion state (V1)
-- ============================================================
-- Schema-only migration for the Archive Pattern Library V1.
-- Adds two tables that the metadata-only archive backfill job
-- (`/api/meta/archive/backfill`) will read and write:
--
--   1. `post_archive_state` — one row per posts.id, tracks
--      independent status axes (metadata / metrics / embedding /
--      ai_tagging / human_review / pattern). V1 only writes
--      `metadata_status`. Future axes use "not_requested" /
--      "not_started" defaults so we never imply work is queued.
--
--   2. `ingestion_cursors` — generic cursor table for resumable
--      backfill jobs (keyed by `job_name`). The archive backfill
--      uses `job_name = 'meta.media.archive_backfill'`.
--
-- No changes to `posts`, `raw_instagram_media`,
-- `raw_instagram_media_insights`, `post_metrics_daily`,
-- `post_tags`, `content_themes`, or `content_recommendations`.
--
-- No cron, no AI, no embeddings, no insights are wired up by
-- this migration or its V1 caller.
--
-- RLS: per-table single-tenant `authenticated_full_access`
-- policy, mirroring 0006 / 0009 / 0011.
-- updated_at trigger reuses set_updated_at() from 0006.
--
-- Rollback (no down-migration convention in this repo — apply
-- manually if needed, in this order):
--
--   drop trigger if exists post_archive_state_set_updated_at on post_archive_state;
--   drop trigger if exists ingestion_cursors_set_updated_at  on ingestion_cursors;
--   drop table   if exists post_archive_state;
--   drop table   if exists ingestion_cursors;
--
-- No data loss is possible from rolling back: V1 only writes to
-- these two new tables; `posts` and `raw_instagram_media` upserts
-- already happen via the existing live sync path.

-- ----- post_archive_state -------------------------------------------
create table post_archive_state (
  post_id              uuid primary key
                          references posts(id) on delete cascade,

  metadata_status      text not null default 'imported'
                          check (metadata_status in (
                            'imported',
                            'reimport_needed',
                            'error'
                          )),
  metrics_status       text not null default 'not_requested'
                          check (metrics_status in (
                            'not_requested',
                            'queued',
                            'synced',
                            'error',
                            'skipped'
                          )),
  embedding_status     text not null default 'not_started'
                          check (embedding_status in (
                            'not_started',
                            'queued',
                            'done',
                            'error',
                            'skipped'
                          )),
  ai_tagging_status    text not null default 'not_started'
                          check (ai_tagging_status in (
                            'not_started',
                            'queued',
                            'tagged',
                            'error',
                            'skipped'
                          )),
  human_review_status  text not null default 'pending'
                          check (human_review_status in (
                            'pending',
                            'approved',
                            'rejected'
                          )),
  pattern_status       text not null default 'pending'
                          check (pattern_status in (
                            'pending',
                            'linked',
                            'excluded'
                          )),

  archive_priority     smallint,
  last_indexed_at      timestamptz not null default now(),
  last_error           text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Partial indexes on the future-work axes so "what's queued?"
-- queries stay cheap once the corresponding workers ship. None
-- of these are exercised by V1 code paths.
create index post_archive_state_metrics_queued_idx
  on post_archive_state (post_id)
  where metrics_status = 'queued';

create index post_archive_state_embedding_queued_idx
  on post_archive_state (post_id)
  where embedding_status = 'queued';

create index post_archive_state_ai_tagging_queued_idx
  on post_archive_state (post_id)
  where ai_tagging_status = 'queued';

create index post_archive_state_human_review_pending_idx
  on post_archive_state (post_id)
  where human_review_status = 'pending';

create index post_archive_state_pattern_pending_idx
  on post_archive_state (post_id)
  where pattern_status = 'pending';

create trigger post_archive_state_set_updated_at
  before update on post_archive_state
  for each row execute function set_updated_at();

-- ----- ingestion_cursors --------------------------------------------
create table ingestion_cursors (
  id                       uuid primary key default gen_random_uuid(),
  job_name                 text not null unique,

  cursor                   text,
  last_processed_media_id  text,

  status                   text not null default 'idle'
                              check (status in (
                                'idle',
                                'running',
                                'paused',
                                'complete',
                                'error'
                              )),

  fetched_count            integer not null default 0,
  upserted_count           integer not null default 0,
  skipped_count            integer not null default 0,
  error_count              integer not null default 0,

  started_at               timestamptz,
  ran_at                   timestamptz,
  finished_at              timestamptz,
  last_error               text,
  payload                  jsonb not null default '{}'::jsonb,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index ingestion_cursors_status_idx on ingestion_cursors (status);

create trigger ingestion_cursors_set_updated_at
  before update on ingestion_cursors
  for each row execute function set_updated_at();

-- ----- RLS ----------------------------------------------------------
alter table post_archive_state enable row level security;
alter table ingestion_cursors  enable row level security;

create policy "authenticated_full_access" on post_archive_state
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on ingestion_cursors
  for all to authenticated using (true) with check (true);
