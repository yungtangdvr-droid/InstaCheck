-- ============================================================
-- Creator Hub — Migration 0020 : content_recommendations
--                                confidence / signal_strength /
--                                generated_at (V2 internal fields)
-- ============================================================
-- Additive schema change. No column or constraint is dropped, no
-- existing row is mutated. Manual recommendations (source='manual',
-- written by apps/web/features/content-lab/actions.ts) keep
-- inserting unchanged because every new column is nullable.
--
-- Why
-- ---
-- Migration 0019 introduced a Recommendation Confidence Engine that
-- computes a deterministic 0..100 score per candidate plus a
-- categorical band. We persist these on the row at insert time so:
--
--   1. The /api/content-lab/refresh-recommendations summary can
--      surface quality counters in automation_runs without re-
--      querying the view.
--   2. Future internal diagnostics can reason about confidence
--      drift over time without back-computing it.
--
-- These fields are INTERNAL. The /content-lab page only selects
-- (id, post_id, type, reason, created_at) — see
-- apps/web/app/(dashboard)/content-lab/page.tsx — so adding columns
-- here does NOT add UI. No badge, no chip, no tooltip is rendered.
--
-- Idempotency identity
-- --------------------
-- Unchanged from migration 0018: (source='auto', post_id, type,
-- reason_code), enforced by content_recommendations_auto_dedupe_idx.
-- The new columns are NOT part of any unique key, so multiplier
-- drift or confidence drift cannot produce duplicates on cron
-- re-runs.
--
-- Schema additions
-- ----------------
--   * type   `content_recommendation_signal_strength`
--            enum {'weak','moderate','strong'}
--   * column `content_recommendations.confidence`
--            smallint NULL CHECK (confidence is null
--                                 OR confidence between 0 and 100)
--   * column `content_recommendations.signal_strength`
--            content_recommendation_signal_strength NULL
--   * column `content_recommendations.generated_at`
--            timestamptz NULL
--
-- Plus a CHECK that requires the three new fields to be present
-- ONLY for source='auto' rows. Manual rows leave them NULL.
--
-- Rollback (no down-migration convention in this repo)
-- ----------------------------------------------------
--   alter table public.content_recommendations
--     drop constraint if exists content_recommendations_auto_has_quality_chk;
--   alter table public.content_recommendations
--     drop column if exists generated_at,
--     drop column if exists signal_strength,
--     drop column if exists confidence;
--   drop type if exists public.content_recommendation_signal_strength;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'content_recommendation_signal_strength'
  ) then
    create type public.content_recommendation_signal_strength as enum (
      'weak', 'moderate', 'strong'
    );
  end if;
end
$$;

alter table public.content_recommendations
  add column if not exists confidence       smallint;

alter table public.content_recommendations
  add column if not exists signal_strength  public.content_recommendation_signal_strength;

alter table public.content_recommendations
  add column if not exists generated_at     timestamptz;

-- Range check for the confidence integer. Nullable so existing
-- manual rows (which never had a confidence) keep passing.
alter table public.content_recommendations
  drop constraint if exists content_recommendations_confidence_range_chk;

alter table public.content_recommendations
  add constraint content_recommendations_confidence_range_chk
  check (confidence is null or (confidence >= 0 and confidence <= 100));

-- Source-aware CHECK : auto rows must carry all three quality
-- fields; manual rows are unconstrained on these fields.
--
-- Declared NOT VALID on purpose: any pre-existing auto rows that
-- were inserted by PR #91 (V1) before this migration ran do not
-- carry confidence / signal_strength / generated_at and would fail
-- a strict validation pass. NOT VALID applies the constraint to
-- all future INSERT and UPDATE operations (which is what the V2
-- writer needs) while leaving historical V1 rows untouched. V1
-- rows persist with NULL quality fields; the dedupe identity
-- (post_id, type, reason_code) from 0018 keeps the V2 writer from
-- re-inserting on top of them, so V1 rows are preserved as-is.
alter table public.content_recommendations
  drop constraint if exists content_recommendations_auto_has_quality_chk;

alter table public.content_recommendations
  add constraint content_recommendations_auto_has_quality_chk
  check (
    source = 'manual'
    or (
      source = 'auto'
      and confidence       is not null
      and signal_strength  is not null
      and generated_at     is not null
    )
  ) not valid;
