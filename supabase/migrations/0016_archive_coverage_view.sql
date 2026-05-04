-- ============================================================
-- Creator Hub — Migration 0016 : Archive coverage view (V1)
-- ============================================================
-- A read-only coverage aggregate to monitor whether the archive
-- backfill is complete enough to trust the archive review queue
-- (`/content-lab/archive/review`) and the era-normalized index
-- it depends on.
--
--   * public.v_archive_coverage_year_format
--
-- Purpose
-- -------
-- The review queue gives a per-post answer ("revoir ce post"); it
-- does not answer the operator-level question "is my archive sample
-- big enough per year × format to trust the priorisation at all?".
-- The baseline views from migration 0015 already aggregate means and
-- per-metric counts but they were designed for the era-normalized
-- index, not for human monitoring (no posts_total, no coverage %).
--
-- This view exposes, for every (year, media_type) bucket of imported
-- archive posts:
--
--   posts_total          — imported posts in the bucket
--   posts_with_metrics   — imported posts that have ≥ 1 row in
--                          post_metrics_daily
--   count_likes          — imported posts whose latest metric row has
--   count_comments         that metric > 0 (proxy for "metric was
--   count_saves            actually captured", since the column is
--   count_shares           NOT NULL DEFAULT 0 and a captured-but-zero
--   count_profile_visits   value is indistinguishable from the
--                          default fill)
--
-- The coverage % (posts_with_metrics / posts_total) is computed in
-- application code, not in the view, so the view stays plain ints
-- with no division-by-zero guard.
--
-- Imported gate
-- -------------
-- Same gate as the baseline views: post_archive_state.metadata_status
-- = 'imported'. human_review_status is intentionally NOT filtered —
-- the coverage view is a measure of the backfill, not of the review
-- queue. A post being approved or rejected does not change whether
-- its metadata was successfully imported.
--
-- Latest-metric definition
-- ------------------------
-- For each post, the "latest metric" is the row from
-- post_metrics_daily with the highest `date` (deterministic via
-- distinct on, mirroring v_archive_baseline_year_format from
-- migration 0015).
--
-- Year basis
-- ----------
-- UTC year extracted from posts.posted_at, identical to the basis
-- used by v_archive_baseline_year_format. Buckets with NULL year
-- are excluded (posted_at is NOT NULL in the schema, so this is
-- defensive only).
--
-- Why no era variant
-- ------------------
-- The operator asked for coverage "by year + media_type". Era-level
-- buckets are an analytical projection used by the review queue's
-- fallback baseline; they would hide year-level gaps (e.g. 2017 fully
-- missing inside `pre_2019`). If an era roll-up is needed later it
-- can be derived in the application from this view.
--
-- Security
-- --------
-- WITH (security_invoker = true) — RLS on posts, post_archive_state
-- and post_metrics_daily is evaluated as the caller, mirroring
-- migration 0015.
--
-- Lifecycle
-- ---------
-- Non-materialised view. No refresh job. If read volume becomes a
-- concern the body can be promoted to a materialised view without
-- changing the column contract.
--
-- Rollback
-- --------
--   drop view if exists public.v_archive_coverage_year_format;

drop view if exists public.v_archive_coverage_year_format cascade;

create view public.v_archive_coverage_year_format
  with (security_invoker = true)
  as
with imported_posts as (
  select
    p.id          as post_id,
    p.media_type,
    p.posted_at
  from public.posts p
  join public.post_archive_state s on s.post_id = p.id
  where s.metadata_status = 'imported'
),
latest_metrics as (
  select distinct on (m.post_id)
    m.post_id,
    m.likes,
    m.comments,
    m.saves,
    m.shares,
    m.profile_visits
  from public.post_metrics_daily m
  order by m.post_id, m.date desc
),
joined as (
  select
    extract(year from ip.posted_at at time zone 'UTC')::int as year,
    ip.media_type,
    ip.post_id,
    lm.likes,
    lm.comments,
    lm.saves,
    lm.shares,
    lm.profile_visits,
    (lm.post_id is not null) as has_any_metric_row
  from imported_posts ip
  left join latest_metrics lm on lm.post_id = ip.post_id
)
select
  year,
  media_type,
  count(*)::int                                      as posts_total,
  count(*) filter (where has_any_metric_row)::int    as posts_with_metrics,
  count(*) filter (where likes          > 0)::int    as count_likes,
  count(*) filter (where comments       > 0)::int    as count_comments,
  count(*) filter (where saves          > 0)::int    as count_saves,
  count(*) filter (where shares         > 0)::int    as count_shares,
  count(*) filter (where profile_visits > 0)::int    as count_profile_visits
from joined
where year is not null
group by year, media_type;

grant select on public.v_archive_coverage_year_format to authenticated, service_role;
