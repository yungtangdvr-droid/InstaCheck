-- ============================================================
-- Creator Hub — Migration 0011 : Meme Radar foundation
-- ============================================================
-- Schema-only migration for the Meme Radar MVP. Adds the four
-- tables and two enums that future PRs (RSS ingest, Gemini
-- scoring, /content-lab/radar feed) will read and write. No
-- application code references these tables yet.
--
-- PR-1 corrections vs. the refined plan:
--   - no `promoted_recommendation_id` (deferred until promote
--     to Content Lab hypothesis ships)
--   - no source-kind enum (RSS-only MVP)
--   - `recommended_format` and `primary_theme` stored as plain
--     `text`, validated in code, mirroring `post_content_analysis`
--
-- RLS: per-table single-tenant `authenticated_full_access`
-- policy, mirroring 0006 / 0009.
-- updated_at trigger reuses set_updated_at() from 0006.

create type radar_item_decision as enum ('new', 'saved', 'ignored');
create type radar_score_status  as enum ('pending', 'completed', 'failed', 'skipped');

-- ----- radar_sources -------------------------------------------------
create table radar_sources (
  id            uuid primary key default gen_random_uuid(),
  url           text not null unique,
  label         text not null,
  language      text,
  active        boolean not null default true,
  last_fetch_at timestamptz,
  last_error    text,
  created_at    timestamptz not null default now()
);

-- ----- raw_radar_items -----------------------------------------------
create table raw_radar_items (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references radar_sources(id) on delete cascade,
  external_id  text not null,
  title        text not null,
  url          text not null,
  summary      text,
  published_at timestamptz,
  raw_json     jsonb,
  fetched_at   timestamptz not null default now(),
  unique (source_id, external_id)
);
create index on raw_radar_items (published_at desc);

-- ----- radar_items ---------------------------------------------------
create table radar_items (
  id           uuid primary key default gen_random_uuid(),
  raw_item_id  uuid not null references raw_radar_items(id) on delete cascade,
  source_id    uuid not null references radar_sources(id) on delete cascade,
  title        text not null,
  url          text not null,
  summary      text,
  published_at timestamptz,
  fingerprint  text not null unique,
  decision     radar_item_decision not null default 'new',
  decision_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index on radar_items (published_at desc);
create index on radar_items (decision);

-- ----- radar_item_scores --------------------------------------------
create table radar_item_scores (
  id                  uuid primary key default gen_random_uuid(),
  radar_item_id       uuid not null unique references radar_items(id) on delete cascade,

  provider            text not null,
  model               text not null,
  prompt_version      text not null,
  status              radar_score_status not null default 'pending',

  meme_potential      integer,
  yugnat_fit          integer,
  timing_urgency      integer,
  visual_potential    integer,
  cultural_relevance  integer,
  composite           integer,

  why_memable         text,
  meme_angles         jsonb,
  recommended_format  text,
  cultural_references text[] not null default '{}',
  primary_theme       text,
  timing_window_hours integer,

  sensitivity_context text[] not null default '{}',
  controversy_level   text,
  misinformation_risk text,
  legal_caution       text,
  tragedy_context     text,

  confidence          numeric(3,2),
  short_reason        text,
  analysis_json       jsonb,
  input_tokens        integer,
  output_tokens       integer,
  error_message       text,
  scored_at           timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on radar_item_scores (status);
create index on radar_item_scores (composite desc);

create trigger radar_item_scores_set_updated_at
  before update on radar_item_scores
  for each row execute function set_updated_at();

-- ----- RLS ----------------------------------------------------------
alter table radar_sources      enable row level security;
alter table raw_radar_items    enable row level security;
alter table radar_items        enable row level security;
alter table radar_item_scores  enable row level security;

create policy "authenticated_full_access" on radar_sources
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on raw_radar_items
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on radar_items
  for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on radar_item_scores
  for all to authenticated using (true) with check (true);
