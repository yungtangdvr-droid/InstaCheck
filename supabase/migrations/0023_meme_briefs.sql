-- ============================================================
-- Creator Hub — Migration 0023 : Meme Briefs (Zeitgeist Signals V1)
-- ============================================================
-- Adds a single `meme_briefs` table that stores structured brief
-- outputs generated from radar items. Radar / current signals are
-- the primary generator; the existing pattern/archive layer is
-- used only as a style-fit filter for `yugnat_fit` / `yugnat_fit_band`.
--
-- Mirrors 0011 conventions:
--   - text columns for closed-set fields (`yugnat_fit_band`,
--     `suggested_language`) validated in code, like
--     `radar_item_scores.controversy_level`
--   - one Postgres enum for the lifecycle status (mirrors
--     `radar_item_decision`)
--   - per-table single-tenant `authenticated_full_access` RLS
--   - `updated_at` trigger reuses `set_updated_at()` from 0006

create type meme_brief_status as enum ('draft', 'kept', 'discarded', 'shipped');

create table meme_briefs (
  id                       uuid primary key default gen_random_uuid(),

  -- Source radar item: nullable so a brief survives a radar item
  -- being cascaded/cleaned up. Cluster siblings live in
  -- `extra_radar_item_ids` (uuid[]) — kept loose, not FK-enforced.
  source_radar_item_id     uuid references radar_items(id) on delete set null,
  extra_radar_item_ids     uuid[] not null default '{}',

  -- Denormalized signal context — copied at generation time so the
  -- brief stays readable even if the underlying radar row drifts.
  signal_title             text,
  signal_url               text,
  signal_image_url         text,
  signal_summary           text,
  source_label             text,
  source_language          text,

  -- Structured brief output (validated against the Zod schema in code).
  cultural_tension         text,
  underlying_feeling       text,
  contradiction            text,
  meme_compression         text,
  visual_direction         text,
  caption_seed             text,
  why_it_is_memeable       text,

  yugnat_fit               integer,
  yugnat_fit_band          text,
  risk_or_timing_caveat    text,
  suggested_language       text,
  freshness_half_life_hours integer,

  -- Lifecycle.
  status                   meme_brief_status not null default 'draft',
  status_at                timestamptz,

  -- Provider attribution + cost accounting (mirrors radar_item_scores).
  provider                 text not null,
  model                    text not null,
  prompt_version           text not null,
  input_tokens             integer,
  output_tokens            integer,
  error_message            text,

  -- Raw provider payload for debugging / replay.
  analysis_json            jsonb,

  generated_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index on meme_briefs (status);
create index on meme_briefs (source_radar_item_id);
create index on meme_briefs (created_at desc);

create trigger meme_briefs_set_updated_at
  before update on meme_briefs
  for each row execute function set_updated_at();

alter table meme_briefs enable row level security;

create policy "authenticated_full_access" on meme_briefs
  for all to authenticated using (true) with check (true);
