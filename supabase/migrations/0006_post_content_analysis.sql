-- ============================================================
-- Creator Hub — Migration 0006 : Content Intelligence v1
-- ============================================================
-- Stores Gemini multimodal analysis output for individual posts.
-- One row per post (1:1). Raw response kept in `analysis_json`
-- for audit; structured fields are denormalized projections of
-- the Zod-validated JSON contract (apps/web/lib/gemini/schema.ts).
--
-- Scope: read-only for the app in v1. Written exclusively by the
-- local manual batch script (apps/web/scripts/content-analysis).
-- No CRON, no API route, no UI surface in v1. The `posts.caption`
-- column stays the Meta-mirror as documented in the master prompt
-- 2026-04-24 NOTE; visible meme text lives here in `visible_text`.

create type content_analysis_status as enum (
  'pending',
  'completed',
  'failed',
  'skipped'
);

create table post_content_analysis (
  id                    uuid primary key default gen_random_uuid(),
  post_id               uuid not null unique references posts(id) on delete cascade,

  provider              text not null,
  model                 text not null,
  prompt_version        text not null,
  status                content_analysis_status not null default 'pending',

  -- Gemini structured output (projected for filtering)
  visible_text          text,
  language              text,
  primary_theme         text,
  secondary_themes      text[] not null default '{}',
  humor_type            text,
  format_pattern        text,
  cultural_reference    text,
  niche_level           text,
  replication_potential text,
  confidence            numeric(3,2),
  short_reason          text,

  -- Audit + cost tracking
  analysis_json         jsonb,
  source_media_url      text,
  input_tokens          integer,
  output_tokens         integer,
  error_message         text,
  analyzed_at           timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index post_content_analysis_status_idx
  on post_content_analysis (status);
create index post_content_analysis_primary_theme_idx
  on post_content_analysis (primary_theme);
create index post_content_analysis_analyzed_at_idx
  on post_content_analysis (analyzed_at desc);

-- Re-usable updated_at trigger (created idempotently — first migration
-- to need it). Future tables can reuse via `before update ... execute
-- function set_updated_at()`.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger post_content_analysis_set_updated_at
  before update on post_content_analysis
  for each row execute function set_updated_at();

-- RLS — same single-tenant policy as 0001
alter table post_content_analysis enable row level security;

create policy "authenticated_full_access"
  on post_content_analysis
  for all
  to authenticated
  using (true)
  with check (true);
