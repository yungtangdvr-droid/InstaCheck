-- ============================================================
-- Creator Hub — Migration 0017 : Content Intelligence v1 (views)
-- ============================================================
-- Two read-only views that power an invisible, statistical
-- content intelligence layer. No new table, no new dependency,
-- no LLM call, no scoring change.
--
--   * public.v_post_intelligence_features
--   * public.v_post_intelligence_candidates
--
-- Purpose
-- -------
-- Today `content_recommendations` is populated only by manual
-- inserts (see apps/web/features/content-lab/actions.ts), so the
-- "Hypothèses récentes" surface on /content-lab tends to be empty.
-- These views consolidate signals the operator already produces
-- (mart performance, archive baseline, content analysis) into a
-- per-post feature row and a per-post candidate row that an
-- application-layer writer can convert into French, action-oriented
-- recommendations.
--
-- Design notes
-- ------------
-- 1. Views only. No materialized state, no refresh job. The
--    application layer reads these views, dedupes in JS, and
--    inserts into `content_recommendations`. Repeated reads are
--    cheap because every view we depend on is itself a view over
--    indexed tables (`v_mart_post_performance`,
--    `v_archive_baseline_*`, `v_archive_coverage_year_format`).
-- 2. security_invoker = true mirrors migrations 0015 / 0016 so
--    RLS on the underlying tables remains authoritative.
-- 3. Era buckets and the year extraction are taken straight from
--    `v_archive_baseline_*` (see migration 0015) so the join is a
--    plain equi-join — no parallel CASE statements that could drift.
-- 4. No DELETE, no DROP of recommendations is implied by these
--    views. They emit candidates; the writer is responsible for
--    idempotent INSERT-only persistence.
-- 5. Confidence / completeness is enforced by hard filters in the
--    candidate view (sample size, coverage pct, content_analysis
--    status). A post that does not meet the gate is simply absent
--    from the candidate set rather than emitted with a low score.
--
-- Rollback (no down-migration convention in this repo)
-- ----------------------------------------------------
--   drop view if exists public.v_post_intelligence_candidates;
--   drop view if exists public.v_post_intelligence_features;

drop view if exists public.v_post_intelligence_candidates cascade;
drop view if exists public.v_post_intelligence_features   cascade;

-- ------------------------------------------------------------
-- v_post_intelligence_features
-- ------------------------------------------------------------
-- Grain: one row per posts.id.
-- Joins :
--   posts                              -- posted_at, media_type
--   v_mart_post_performance            -- score, baselines, in_last_*d
--   post_content_analysis (left join)  -- theme / format / niche
--   v_archive_baseline_year_format     -- archive mean by (year, format)
--   v_archive_baseline_era_format      -- era fallback when year sample small
--   v_archive_coverage_year_format     -- archive coverage % per (year, format)
--
-- All numeric multipliers (saves_multiplier, shares_multiplier,
-- era_index_saves, era_index_shares) are NULL when their denominator
-- is 0 or missing, so the candidate view filters them out cleanly
-- via `> threshold` (NULL fails the comparison).

create view public.v_post_intelligence_features
  with (security_invoker = true)
  as
with mart as (
  select
    pp.post_id,
    pp.media_type,
    pp.posted_at,
    pp.in_last_7d,
    pp.in_last_30d,
    pp.in_last_90d,
    pp.total_saves,
    pp.total_shares,
    pp.baseline_saves,
    pp.baseline_shares,
    pp.format_sample_size,
    pp.performance_score,
    pp.baseline_score,
    pp.score_delta
  from public.v_mart_post_performance pp
),
post_year as (
  select
    m.*,
    extract(year from m.posted_at at time zone 'UTC')::int as year,
    case
      when extract(year from m.posted_at at time zone 'UTC')::int <= 2018 then 'pre_2019'
      when extract(year from m.posted_at at time zone 'UTC')::int <= 2020 then '2019_2020'
      when extract(year from m.posted_at at time zone 'UTC')::int <= 2022 then '2021_2022'
      when extract(year from m.posted_at at time zone 'UTC')::int <= 2024 then '2023_2024'
      else '2025_plus'
    end as era
  from mart m
),
analysis as (
  select
    pca.post_id,
    pca.status                as content_analysis_status,
    pca.primary_theme,
    pca.format_pattern,
    pca.replication_potential,
    pca.niche_level,
    pca.humor_type,
    pca.confidence            as content_analysis_confidence
  from public.post_content_analysis pca
)
select
  py.post_id,
  py.media_type,
  py.posted_at,
  py.year,
  py.era,
  py.in_last_7d,
  py.in_last_30d,
  py.in_last_90d,
  py.total_saves,
  py.total_shares,
  py.baseline_saves,
  py.baseline_shares,
  py.format_sample_size,
  py.performance_score,
  py.baseline_score,
  py.score_delta,
  case
    when coalesce(py.baseline_saves, 0)  > 0
      then (py.total_saves  / py.baseline_saves)::numeric(8,3)
    else null
  end                                          as saves_multiplier,
  case
    when coalesce(py.baseline_shares, 0) > 0
      then (py.total_shares / py.baseline_shares)::numeric(8,3)
    else null
  end                                          as shares_multiplier,
  byf.sample_size                              as archive_year_sample_size,
  byf.mean_saves                               as archive_year_mean_saves,
  byf.mean_shares                              as archive_year_mean_shares,
  bef.sample_size                              as archive_era_sample_size,
  bef.mean_saves                               as archive_era_mean_saves,
  bef.mean_shares                              as archive_era_mean_shares,
  -- era_index_*: latest metric / archive baseline (year first, fallback era).
  -- Null when no usable baseline exists. Capped semantically by the candidate
  -- thresholds, not here, so the raw value remains visible for debugging.
  case
    when coalesce(byf.mean_saves, 0)  > 0 then (py.total_saves  / byf.mean_saves)::numeric(8,3)
    when coalesce(bef.mean_saves, 0)  > 0 then (py.total_saves  / bef.mean_saves)::numeric(8,3)
    else null
  end                                          as era_index_saves,
  case
    when coalesce(byf.mean_shares, 0) > 0 then (py.total_shares / byf.mean_shares)::numeric(8,3)
    when coalesce(bef.mean_shares, 0) > 0 then (py.total_shares / bef.mean_shares)::numeric(8,3)
    else null
  end                                          as era_index_shares,
  cov.posts_total                              as archive_coverage_posts_total,
  cov.posts_with_metrics                       as archive_coverage_posts_with_metrics,
  case
    when coalesce(cov.posts_total, 0) > 0
      then round(
        (cov.posts_with_metrics::numeric / cov.posts_total::numeric) * 100,
        1
      )
    else null
  end                                          as archive_coverage_pct,
  a.content_analysis_status,
  a.primary_theme,
  a.format_pattern,
  a.replication_potential,
  a.niche_level,
  a.humor_type,
  a.content_analysis_confidence,
  -- Days since posted, on Europe/Paris calendar to match the analytics UI.
  greatest(
    0,
    extract(day from (now() at time zone 'Europe/Paris')
                   - (py.posted_at at time zone 'Europe/Paris'))::int
  )                                            as days_since_posted
from post_year py
left join analysis a
  on a.post_id = py.post_id
left join public.v_archive_baseline_year_format byf
  on byf.year       = py.year
 and byf.media_type::text = py.media_type
left join public.v_archive_baseline_era_format  bef
  on bef.era        = py.era
 and bef.media_type::text = py.media_type
left join public.v_archive_coverage_year_format cov
  on cov.year       = py.year
 and cov.media_type::text = py.media_type;

grant select on public.v_post_intelligence_features to authenticated, service_role;

-- ------------------------------------------------------------
-- v_post_intelligence_candidates
-- ------------------------------------------------------------
-- Grain : (post_id, type) — each row is one candidate
-- recommendation. A post can yield zero, one, or two rows.
--
-- Rule set v1 (statistical, deterministic — no ML)
-- ------------------------------------------------
-- replicate :
--   in_last_30d
--   AND performance_score >= 65 AND score_delta >= 15
--   AND format_sample_size >= 5
--   AND content_analysis_status = 'completed'
--   AND replication_potential IN ('high', 'medium')
-- adapt :
--   in_last_90d AND NOT in_last_30d-or-replicate-eligible
--   AND performance_score BETWEEN 45 AND 64
--   AND (era_index_saves >= 1.3 OR era_index_shares >= 1.3)
--   AND archive_year_sample_size >= 8
--   AND content_analysis_status = 'completed'
-- drop :
--   in_last_90d
--   AND performance_score <= 30 AND score_delta <= -15
--   AND format_sample_size >= 5
--   AND days_since_posted BETWEEN 30 AND 90  -- mature enough to judge,
--                                            -- still recent enough to act on
--
-- Each row exposes the columns the TS reason builder consumes —
-- it does NOT generate the French sentence in SQL. This keeps the
-- view stable and the wording editable in TS without a migration.
--
-- `reason_code` is a compact, machine identifier. It MUST NOT be
-- rendered in the UI: the TS layer maps it to a French, short,
-- action-oriented sentence stored in `content_recommendations.reason`.

create view public.v_post_intelligence_candidates
  with (security_invoker = true)
  as
with f as (
  select * from public.v_post_intelligence_features
)
-- replicate -------------------------------------------------------
select
  f.post_id,
  'replicate'::content_recommendation_type      as type,
  'recent_strong_performer'::text               as reason_code,
  f.media_type,
  f.posted_at,
  f.performance_score,
  f.score_delta,
  f.saves_multiplier,
  f.shares_multiplier,
  f.era_index_saves,
  f.era_index_shares,
  f.primary_theme,
  f.format_pattern,
  f.replication_potential,
  f.format_sample_size,
  f.archive_year_sample_size,
  f.archive_coverage_pct,
  f.days_since_posted
from f
where f.in_last_30d = true
  and f.performance_score    >= 65
  and f.score_delta          >= 15
  and f.format_sample_size   >= 5
  and f.content_analysis_status = 'completed'
  and f.replication_potential in ('high', 'medium')

union all
-- adapt ----------------------------------------------------------
select
  f.post_id,
  'adapt'::content_recommendation_type          as type,
  'era_format_match'::text                      as reason_code,
  f.media_type,
  f.posted_at,
  f.performance_score,
  f.score_delta,
  f.saves_multiplier,
  f.shares_multiplier,
  f.era_index_saves,
  f.era_index_shares,
  f.primary_theme,
  f.format_pattern,
  f.replication_potential,
  f.format_sample_size,
  f.archive_year_sample_size,
  f.archive_coverage_pct,
  f.days_since_posted
from f
where f.in_last_90d = true
  and f.performance_score between 45 and 64
  and (
        coalesce(f.era_index_saves,  0) >= 1.3
     or coalesce(f.era_index_shares, 0) >= 1.3
      )
  and coalesce(f.archive_year_sample_size, 0) >= 8
  and f.content_analysis_status = 'completed'
  -- Don't double-emit a post that's already a 'replicate' candidate.
  and not (
        f.in_last_30d = true
    and f.performance_score >= 65
    and f.score_delta       >= 15
    and f.format_sample_size >= 5
    and f.replication_potential in ('high', 'medium')
  )

union all
-- drop -----------------------------------------------------------
select
  f.post_id,
  'drop'::content_recommendation_type           as type,
  'recent_underperform'::text                   as reason_code,
  f.media_type,
  f.posted_at,
  f.performance_score,
  f.score_delta,
  f.saves_multiplier,
  f.shares_multiplier,
  f.era_index_saves,
  f.era_index_shares,
  f.primary_theme,
  f.format_pattern,
  f.replication_potential,
  f.format_sample_size,
  f.archive_year_sample_size,
  f.archive_coverage_pct,
  f.days_since_posted
from f
where f.in_last_90d = true
  and f.performance_score   <= 30
  and f.score_delta         <= -15
  and f.format_sample_size  >= 5
  -- Post must be mature enough that low metrics are not just "too fresh"
  -- (Instagram engagement keeps accumulating for ~3-4 weeks). Capped at 90
  -- days so we never re-litigate ancient archive posts; this also keeps the
  -- bound consistent with the in_last_90d gate above.
  and f.days_since_posted between 30 and 90;

grant select on public.v_post_intelligence_candidates to authenticated, service_role;
