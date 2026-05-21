-- ============================================================
-- Creator Hub — Migration 0022 : Creative Pattern Mining V1
-- ============================================================
-- Builds an additive read-only layer on top of the existing
-- Content Intelligence system (migrations 0017 and 0019) that
-- groups posts into recurring "creative patterns" — deterministic
-- families derived from already-populated categorical fields, with
-- aggregated performance, multipliers, confidence and a single
-- replicate / adapt / drop tag per pattern.
--
-- New views in this migration
--   * public.v_post_pattern_assignment   -- one row per analyzed post
--   * public.v_creative_pattern_stats    -- one row per pattern_key
--   * public.v_creative_pattern_examples -- top-K example posts per pattern
--
-- Scope (intentionally narrow)
-- ----------------------------
-- 1. SQL views only. No new tables, no migration to content_recommendations,
--    no change to the existing auto-writer (refreshContentRecommendations).
-- 2. No new dependency, no LLM call, no scoring change. The global scoring
--    semantics in v_mart_post_performance, v_post_intelligence_features,
--    v_post_intelligence_candidates and v_post_intelligence_quality are
--    NOT touched.
-- 3. Pattern grouping is rule-based and explainable:
--      pattern_key = slug(media_type) || '__' ||
--                    slug(primary_theme) || '__' ||
--                    slug(format_pattern) || '__' ||
--                    slug(humor_type)
--    Four axes, all already populated by the Gemini meme-analysis
--    pipeline (post_content_analysis, migration 0006). Each segment
--    is lower-cased and stripped of any non-alphanumeric character
--    so the key stays stable, URL-safe and museum-ready.
-- 4. pattern_key_lite drops humor_type to provide a coarser fallback
--    grouping that the UI can offer when buckets become too sparse.
-- 5. Stats and recommendation banding are isolated inside this
--    migration: nothing outside reads them yet beyond the new
--    /content-lab/patterns UI.
--
-- Bayesian shrinkage
-- ------------------
-- The adjusted score uses k = 10 as prior weight. This is intentionally
-- a touch heavier than the theme-level shrinkage (THEME_MIN_SAMPLE_SIZE = 5
-- in apps/web/features/content-lab/get-content-analysis.ts) because the
-- pattern grain is finer (4-axis tuple vs. 1-axis theme) and small
-- buckets are more common. Keeping it documented here so future
-- changes to either prior happen consciously, not by drift.
--
-- security_invoker = true mirrors migrations 0015–0019 so RLS on the
-- underlying tables remains authoritative.
--
-- Rollback (no down-migration convention in this repo)
-- ----------------------------------------------------
--   drop view if exists public.v_creative_pattern_examples cascade;
--   drop view if exists public.v_creative_pattern_stats    cascade;
--   drop view if exists public.v_post_pattern_assignment   cascade;

drop view if exists public.v_creative_pattern_examples cascade;
drop view if exists public.v_creative_pattern_stats    cascade;
drop view if exists public.v_post_pattern_assignment   cascade;

-- ------------------------------------------------------------
-- v_post_pattern_assignment
-- ------------------------------------------------------------
-- Grain: one row per posts.id with a completed content analysis
-- whose four core categorical fields are non-null and not 'unknown'.
--
-- Posts whose Gemini run returned 'unknown' on any of the four core
-- axes are excluded here rather than silently bucketed into an
-- "unknown" pattern: a pattern with mixed-unknown axes is not a
-- creative family, it's a measurement gap, and surfacing it would
-- pollute the ranking and the future museum.
--
-- niche_level, replication_potential and language are carried
-- alongside as descriptors. They are NOT part of pattern_key — using
-- them as keys would explode the bucket count (low-cardinality fields
-- combined make every post unique). The UI surfaces them on the
-- pattern detail page as additional context.

create view public.v_post_pattern_assignment
  with (security_invoker = true)
  as
select
  pca.post_id,
  p.media_type::text                       as media_type,
  pca.primary_theme,
  pca.format_pattern,
  pca.humor_type,
  pca.niche_level,
  pca.replication_potential,
  pca.language,
  (
    lower(regexp_replace(p.media_type::text, '[^a-zA-Z0-9]+', '-', 'g')) || '__' ||
    lower(regexp_replace(pca.primary_theme,  '[^a-zA-Z0-9]+', '-', 'g')) || '__' ||
    lower(regexp_replace(pca.format_pattern, '[^a-zA-Z0-9]+', '-', 'g')) || '__' ||
    lower(regexp_replace(pca.humor_type,     '[^a-zA-Z0-9]+', '-', 'g'))
  )                                        as pattern_key,
  (
    lower(regexp_replace(p.media_type::text, '[^a-zA-Z0-9]+', '-', 'g')) || '__' ||
    lower(regexp_replace(pca.primary_theme,  '[^a-zA-Z0-9]+', '-', 'g')) || '__' ||
    lower(regexp_replace(pca.format_pattern, '[^a-zA-Z0-9]+', '-', 'g'))
  )                                        as pattern_key_lite
from public.post_content_analysis pca
join public.posts p on p.id = pca.post_id
where pca.status         = 'completed'
  and pca.primary_theme  is not null and pca.primary_theme  <> 'unknown'
  and pca.format_pattern is not null and pca.format_pattern <> 'unknown'
  and pca.humor_type     is not null and pca.humor_type     <> 'unknown';

grant select on public.v_post_pattern_assignment to authenticated, service_role;

-- ------------------------------------------------------------
-- v_creative_pattern_stats
-- ------------------------------------------------------------
-- Grain: one row per pattern_key with at least one assigned post
-- that has a non-null performance_score in v_post_intelligence_features.
--
-- The account-level mean used as the Bayesian prior comes from
-- v_post_intelligence_features (same surface as the rest of the
-- intelligence layer), restricted to scored rows. We do NOT
-- recompute or redefine the performance score here.
--
-- Recommendation rules (computed in this view only — isolated from
-- v_post_intelligence_candidates):
--   replicate : sample_size >= 4
--               AND bayes_adjusted_score >= 60
--               AND mean_saves_multiplier >= 1.3
--               AND signal_strength <> 'weak'
--   drop      : sample_size >= 5
--               AND bayes_adjusted_score <= 35
--               AND mean_saves_multiplier <= 0.8
--   adapt     : sample_size >= 4 otherwise
--   NULL      : sample_size < 4 (insufficient evidence, UI suppresses
--               or surfaces in a dedicated "weak" section).

create view public.v_creative_pattern_stats
  with (security_invoker = true)
  as
with assigned as (
  select
    pa.pattern_key,
    pa.pattern_key_lite,
    pa.media_type,
    pa.primary_theme,
    pa.format_pattern,
    pa.humor_type,
    f.performance_score,
    f.score_delta,
    f.saves_multiplier,
    f.shares_multiplier,
    f.in_last_90d,
    f.content_analysis_confidence
  from public.v_post_pattern_assignment pa
  join public.v_post_intelligence_features f on f.post_id = pa.post_id
  where f.performance_score is not null
),
account_mean as (
  select coalesce(avg(performance_score), 0)::numeric as global_mean
  from public.v_post_intelligence_features
  where performance_score is not null
),
agg as (
  select
    a.pattern_key,
    a.pattern_key_lite,
    max(a.media_type)                                                            as media_type,
    max(a.primary_theme)                                                         as primary_theme,
    max(a.format_pattern)                                                        as format_pattern,
    max(a.humor_type)                                                            as humor_type,
    count(*)::int                                                                as sample_size,
    (count(*) filter (where a.in_last_90d))::int                                 as posts_last_90d,
    round(avg(a.performance_score)::numeric, 2)                                  as mean_performance_score,
    round(avg(a.score_delta)::numeric, 2)                                        as mean_score_delta,
    round(avg(a.saves_multiplier)::numeric, 3)                                   as mean_saves_multiplier,
    round(avg(a.shares_multiplier)::numeric, 3)                                  as mean_shares_multiplier,
    round(
      (count(*) filter (where a.score_delta > 0))::numeric
        / nullif(count(*), 0)::numeric, 3
    )                                                                            as share_above_baseline,
    avg(a.content_analysis_confidence)::numeric                                  as mean_analysis_confidence
  from assigned a
  group by a.pattern_key, a.pattern_key_lite
),
scored as (
  select
    ag.*,
    am.global_mean,
    -- Bayesian-adjusted score: weighted average of pattern mean and the
    -- global mean, with prior weight k = 10. Keeps small-sample patterns
    -- from climbing the ranking on a single viral hit.
    round(
      (ag.mean_performance_score * ag.sample_size + am.global_mean * 10)
        / (ag.sample_size + 10),
      2
    )                                                                            as bayes_adjusted_score,
    -- Pattern confidence: 50% sample size, 20% recency, 30% mean Gemini
    -- confidence. Sample-driven by design — a pattern stops being a
    -- "pattern" if you've only made it 1-2 times.
    least(greatest(
      round(
        (
          0.50 * least(ag.sample_size::numeric / 10::numeric, 1::numeric) +
          0.20 * least(ag.posts_last_90d::numeric / 4::numeric, 1::numeric) +
          0.30 * coalesce(ag.mean_analysis_confidence, 0::numeric)
        ) * 100
      )::int,
      0
    ), 100)                                                                      as pattern_confidence
  from agg ag
  cross join account_mean am
)
select
  s.pattern_key,
  s.pattern_key_lite,
  s.media_type,
  s.primary_theme,
  s.format_pattern,
  s.humor_type,
  s.sample_size,
  s.posts_last_90d,
  s.mean_performance_score,
  s.mean_score_delta,
  s.mean_saves_multiplier,
  s.mean_shares_multiplier,
  s.share_above_baseline,
  s.bayes_adjusted_score,
  10::int                                                                        as bayes_shrinkage_k,
  s.pattern_confidence,
  case
    when s.pattern_confidence >= 75 then 'strong'
    when s.pattern_confidence >= 50 then 'moderate'
    else 'weak'
  end::text                                                                      as signal_strength,
  case
    when s.sample_size < 4                                              then null
    when s.bayes_adjusted_score >= 60
     and coalesce(s.mean_saves_multiplier, 0) >= 1.3
     and s.pattern_confidence >= 50                                     then 'replicate'
    when s.sample_size >= 5
     and s.bayes_adjusted_score <= 35
     and coalesce(s.mean_saves_multiplier, 1) <= 0.8                    then 'drop'
    else                                                                     'adapt'
  end::text                                                                      as recommendation
from scored s;

grant select on public.v_creative_pattern_stats to authenticated, service_role;

-- ------------------------------------------------------------
-- v_creative_pattern_examples
-- ------------------------------------------------------------
-- Grain: one row per (pattern_key, post_id). Provides a stable ranking
-- inside each pattern so the UI can pick the top-K examples without
-- doing another aggregate in JS.
--
-- Sort: performance_score desc, then posted_at desc (newest tiebreak).
-- The app consumes `rank_in_pattern <= 5` for the detail page.

create view public.v_creative_pattern_examples
  with (security_invoker = true)
  as
select
  pa.pattern_key,
  pa.post_id,
  f.posted_at,
  f.media_type,
  f.performance_score,
  f.score_delta,
  f.saves_multiplier,
  f.shares_multiplier,
  row_number() over (
    partition by pa.pattern_key
    order by f.performance_score desc nulls last, f.posted_at desc nulls last
  )::int                                  as rank_in_pattern
from public.v_post_pattern_assignment pa
join public.v_post_intelligence_features f on f.post_id = pa.post_id
where f.performance_score is not null;

grant select on public.v_creative_pattern_examples to authenticated, service_role;
