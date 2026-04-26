-- ============================================================
-- Creator Hub — Migration 0007 : External Benchmark Foundation
-- ============================================================
-- PR 2: additive schema only. No UI, no API route, no scheduled
-- sync, no scoring change. Tables here are written exclusively
-- by a local CLI probe in this PR; downstream sync wiring is a
-- later PR.
--
-- Reposts doctrine: kept as a first-class column but NULLABLE.
-- The official Meta Graph API may or may not expose a reshare /
-- share field on a given media object. The probe records the
-- per-metric availability in `metric_availability` jsonb using
-- the `benchmark_metric_status` enum below.
--
-- Compliance:
--   - No `reach`, `saves`, `shares`, `profile_visits`, audience
--     demographics, or any private/inferred metric is stored.
--   - `fetched_via` is constrained to official Graph API methods
--     (business_discovery, oembed). Scraping is forbidden.
--
-- Numbering note (drift): packages/db/migrations stops at 0003
-- because the mart_views (0004, 0005) and post_content_analysis
-- (0006) migrations were only mirrored into supabase/migrations.
-- This PR does NOT retro-mirror those; it only adds 0007 here
-- and 0004 in packages/db (next valid number for that folder).
-- See packages/db/migrations/0004_benchmark_foundation.sql.

create type benchmark_cohort as enum (
  'meme',
  'lifestyle',
  'fashion',
  'beauty',
  'food',
  'travel',
  'fitness',
  'gaming',
  'other'
);

create type benchmark_metric_status as enum (
  'available',
  'unavailable_field',
  'unavailable_400',
  'unavailable_403',
  'unavailable_other'
);

create table benchmark_accounts (
  id           uuid primary key default gen_random_uuid(),
  ig_username  text unique not null,
  ig_user_id   text,
  display_name text,
  cohort       benchmark_cohort not null,
  language     text,
  notes        text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index benchmark_accounts_cohort_idx
  on benchmark_accounts (cohort);
create index benchmark_accounts_active_idx
  on benchmark_accounts (active);

create table raw_benchmark_instagram_account_daily (
  id                   uuid primary key default gen_random_uuid(),
  benchmark_account_id uuid not null references benchmark_accounts(id) on delete cascade,
  date                 date not null,
  followers_count      bigint,
  media_count          bigint,
  metric_availability  jsonb not null default '{}'::jsonb,
  fetched_via          text not null,
  raw_json             jsonb not null,
  synced_at            timestamptz not null default now(),
  unique (benchmark_account_id, date)
);

create index raw_benchmark_instagram_account_daily_date_idx
  on raw_benchmark_instagram_account_daily (date);

create table raw_benchmark_instagram_media (
  id                   uuid primary key default gen_random_uuid(),
  benchmark_account_id uuid not null references benchmark_accounts(id) on delete cascade,
  media_id             text not null,
  media_type           text,
  permalink            text,
  posted_at            timestamptz,
  like_count           bigint,
  comments_count       bigint,
  view_count           bigint,
  reposts              bigint,
  raw_json             jsonb not null,
  metric_availability  jsonb not null default '{}'::jsonb,
  fetched_via          text not null,
  synced_at            timestamptz not null default now(),
  unique (benchmark_account_id, media_id)
);

create index raw_benchmark_instagram_media_posted_at_idx
  on raw_benchmark_instagram_media (posted_at);

create table benchmark_sync_runs (
  id                  uuid primary key default gen_random_uuid(),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  status              text not null,
  kind                text not null,
  accounts_attempted  integer not null default 0,
  accounts_succeeded  integer not null default 0,
  media_fetched       integer not null default 0,
  errors              jsonb not null default '[]'::jsonb,
  fetched_via         text,
  notes               text
);

create index benchmark_sync_runs_started_at_idx
  on benchmark_sync_runs (started_at desc);
