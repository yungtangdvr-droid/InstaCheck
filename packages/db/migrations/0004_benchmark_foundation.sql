-- ============================================================
-- Creator Hub — packages/db Migration 0004 : External Benchmark
-- Foundation
-- ============================================================
-- IMPORTANT — numbering drift notice:
-- This file is numbered 0004 (next valid for packages/db) while
-- the matching Supabase migration is numbered 0007. The drift
-- is pre-existing: 0004_mart_views, 0005_mart_views_bootstrap,
-- and 0006_post_content_analysis exist only under
-- supabase/migrations/. This PR does NOT retro-mirror those —
-- it only adds the next valid number in each folder for the
-- benchmark foundation. Body below is identical to
-- supabase/migrations/0007_benchmark_foundation.sql.
--
-- See that file for the full doctrine notes (reposts policy,
-- forbidden metrics, fetched_via constraints).

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
