-- ============================================================
-- Creator Hub — Migration 0018 : content_recommendations
--                                source / reason_code (V1)
-- ============================================================
-- Additive schema change to make automated content_recommendations
-- inserts safely idempotent without ever touching manual rows.
--
-- Why
-- ---
-- Migration 0017 introduced an invisible content intelligence layer
-- that writes deterministic French sentences into
-- `content_recommendations.reason`. The first idempotency strategy
-- used `(post_id, type, reason)` as the dedupe key, but generated
-- reason text is sensitive to multipliers (saves_multiplier,
-- shares_multiplier, era_index_*) which drift as the archive
-- backfill lands new metrics. A drifted multiplier would change
-- the formatted sentence by a single character (e.g. "×1,7"
-- → "×1,8") and produce a duplicate row on every cron run.
--
-- This migration replaces that with a stable identity:
--
--   (source = 'auto', post_id, type, reason_code)
--
-- where `reason_code` is the machine identifier emitted by the
-- candidate view (`recent_strong_performer`, `era_format_match`,
-- `recent_underperform`). It is NEVER rendered in the UI — the UI
-- still reads `reason` only.
--
-- Schema additions (additive only — no column ever dropped)
-- ---------------------------------------------------------
--   * type   `content_recommendation_source` enum {'manual','auto'}
--   * column `content_recommendations.source`
--            content_recommendation_source NOT NULL DEFAULT 'manual'
--   * column `content_recommendations.reason_code` text NULL
--   * unique index `content_recommendations_auto_dedupe_idx`
--            on (post_id, type, reason_code) where source = 'auto'
--
-- The partial unique index is intentionally narrow: it constrains
-- only auto-generated rows. Manual rows can repeat freely, so the
-- existing `upsertRecommendation` server action never collides
-- with this migration.
--
-- Default = 'manual' is what makes this migration safe on existing
-- data: every pre-existing row becomes a manual row (which it is —
-- they were all inserted by the manual server action).
--
-- Rollback (no down-migration convention in this repo)
-- ----------------------------------------------------
--   drop index if exists public.content_recommendations_auto_dedupe_idx;
--   alter table public.content_recommendations
--     drop column if exists reason_code,
--     drop column if exists source;
--   drop type  if exists public.content_recommendation_source;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'content_recommendation_source') then
    create type public.content_recommendation_source as enum ('manual', 'auto');
  end if;
end
$$;

alter table public.content_recommendations
  add column if not exists source      public.content_recommendation_source not null default 'manual';

alter table public.content_recommendations
  add column if not exists reason_code text;

-- Partial unique index: one auto recommendation per (post_id, type, reason_code).
-- Applies only to source = 'auto' so manual rows remain unconstrained.
create unique index if not exists content_recommendations_auto_dedupe_idx
  on public.content_recommendations (post_id, type, reason_code)
  where source = 'auto';

-- Sanity check: an auto row must carry a reason_code so the dedupe
-- index actually has all the values it needs. Manual rows stay null.
alter table public.content_recommendations
  drop constraint if exists content_recommendations_auto_has_reason_code_chk;

alter table public.content_recommendations
  add constraint content_recommendations_auto_has_reason_code_chk
  check (
    source = 'manual'
    or (source = 'auto' and reason_code is not null and length(reason_code) > 0)
  );
